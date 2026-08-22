package com.example.smart_health_android.security

import com.example.smart_health_android.data.FirebaseAccountCreationReceipt
import com.example.smart_health_android.data.FirebaseOwnerBinding
import com.example.smart_health_android.data.PendingRegistration
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ProductionSignUpRepositoryTest {
    @Test
    fun `encrypted draft is saved before Firebase identity and then bound to the captured owner`() =
        runTest {
            val events = mutableListOf<String>()
            val owner = owner("firebase-a", "patient@shcare.vn", 7L)
            val firebase = FakeSignUpFirebaseGateway(events, createdOwner = owner)
            val checkpoint = FakeSignUpRegistrationCheckpoint(events)
            val repository = repository(firebase, checkpoint)

            val returnedOwner = repository.submit(patientSubmission())

            assertEquals(listOf("save-draft", "create-account", "bind-owner"), events)
            assertEquals("", requireNotNull(checkpoint.draft).firebaseUserId)
            assertTrue(requireNotNull(checkpoint.draft).roleRequestIdempotencyKey.isNotBlank())
            assertEquals(
                checkpoint.draft?.roleRequestIdempotencyKey,
                checkpoint.boundRegistration?.roleRequestIdempotencyKey,
            )
            assertEquals(owner, checkpoint.boundOwner)
            assertEquals(owner, returnedOwner)
            assertEquals(1, firebase.createCalls)
            assertEquals(0, firebase.resendCalls)
        }

    @Test
    fun `matching current owner resumes a partial creation without trying to recreate the email`() =
        runTest {
            val events = mutableListOf<String>()
            val owner = owner("firebase-a", "patient@shcare.vn", 11L)
            val firebase = FakeSignUpFirebaseGateway(
                events = events,
                initialOwner = owner,
                createdOwner = owner,
            )
            val checkpoint = FakeSignUpRegistrationCheckpoint(events)
            val repository = repository(firebase, checkpoint)

            val returnedOwner = repository.submit(patientSubmission())

            assertEquals(listOf("save-draft", "bind-owner", "resend-verification"), events)
            assertEquals(0, firebase.createCalls)
            assertEquals(1, firebase.resendCalls)
            assertEquals(owner, returnedOwner)
        }

    @Test
    fun `post-identity Firebase failure is recovered in the same attempt without false creation failure`() =
        runTest {
            val events = mutableListOf<String>()
            val owner = owner("firebase-a", "patient@shcare.vn", 13L)
            val firebase = FakeSignUpFirebaseGateway(
                events = events,
                createdOwner = owner,
                createFailureAfterOwner = IOException("verification dispatch interrupted"),
            )
            val checkpoint = FakeSignUpRegistrationCheckpoint(events)
            val repository = repository(firebase, checkpoint)

            val returnedOwner = repository.submit(patientSubmission())

            assertEquals(
                listOf("save-draft", "create-account", "bind-owner", "resend-verification"),
                events,
            )
            assertEquals(owner, checkpoint.boundOwner)
            assertEquals(owner, returnedOwner)
            assertEquals(1, firebase.createCalls)
            assertEquals(1, firebase.resendCalls)
        }

    @Test
    fun `foreign current Firebase owner is rejected before any checkpoint is overwritten`() =
        runTest {
            val events = mutableListOf<String>()
            val firebase = FakeSignUpFirebaseGateway(
                events = events,
                initialOwner = owner("firebase-b", "other@shcare.vn", 3L),
            )
            val checkpoint = FakeSignUpRegistrationCheckpoint(events)
            val repository = repository(firebase, checkpoint)

            val failure = captureFailure { repository.submit(patientSubmission()) }

            assertTrue(failure is IllegalStateException)
            assertTrue(events.isEmpty())
            assertEquals(null, checkpoint.draft)
        }

    @Test
    fun `owner replacement after account creation leaves recovery draft but never binds or succeeds`() =
        runTest {
            val events = mutableListOf<String>()
            val createdOwner = owner("firebase-a", "patient@shcare.vn", 17L)
            val firebase = FakeSignUpFirebaseGateway(
                events = events,
                createdOwner = createdOwner,
                ownerAfterCreate = owner("firebase-b", "other@shcare.vn", 18L),
            )
            val checkpoint = FakeSignUpRegistrationCheckpoint(events)
            val repository = repository(firebase, checkpoint)

            val failure = captureFailure { repository.submit(patientSubmission()) }

            assertTrue(failure is IllegalStateException)
            assertEquals(listOf("save-draft", "create-account"), events)
            assertEquals("patient@shcare.vn", checkpoint.draft?.email)
            assertEquals(null, checkpoint.boundOwner)
        }

    @Test
    fun `ABA owner replacement with the same uid and email is rejected by session epoch`() =
        runTest {
            val events = mutableListOf<String>()
            val createdOwner = owner("firebase-a", "patient@shcare.vn", 21L)
            val firebase = FakeSignUpFirebaseGateway(
                events = events,
                createdOwner = createdOwner,
                ownerAfterCreate = createdOwner.copy(sessionEpoch = 23L),
            )
            val repository = repository(
                firebase,
                FakeSignUpRegistrationCheckpoint(events),
            )

            val failure = captureFailure { repository.submit(patientSubmission()) }
            assertTrue(failure is IllegalStateException)
            assertEquals(listOf("save-draft", "create-account"), events)
        }

    @Test
    fun `attempt callback captures the exact owner before a bound checkpoint failure`() =
        runTest {
            val events = mutableListOf<String>()
            val createdOwner = owner("firebase-a", "patient@shcare.vn", 31L)
            val checkpoint = FakeSignUpRegistrationCheckpoint(
                events = events,
                bindFailure = IOException("encrypted checkpoint unavailable"),
            )
            val repository = repository(
                firebase = FakeSignUpFirebaseGateway(
                    events = events,
                    createdOwner = createdOwner,
                ),
                checkpoint = checkpoint,
            )
            val attempts = mutableListOf<SignUpRegistrationAttempt>()

            val failure = captureFailure {
                repository.submit(
                    submission = patientSubmission(),
                    onAttemptBound = attempts::add,
                )
            }

            assertTrue(failure is IOException)
            assertEquals(
                listOf("save-draft", "create-account", "bind-owner"),
                events,
            )
            assertEquals(2, attempts.size)
            assertEquals(null, attempts.first().firebaseOwner)
            assertEquals(createdOwner, attempts.last().firebaseOwner)
            assertEquals(attempts.first().operationId, attempts.last().operationId)
        }

    @Test
    fun `cancellation after Firebase creates an owner still publishes the exact ABA binding`() =
        runTest {
            val events = mutableListOf<String>()
            val createdOwner = owner("firebase-a", "patient@shcare.vn", 37L)
            val repository = repository(
                firebase = FakeSignUpFirebaseGateway(
                    events = events,
                    createdOwner = createdOwner,
                    createFailureAfterOwner = CancellationException("screen disposed"),
                ),
                checkpoint = FakeSignUpRegistrationCheckpoint(events),
            )
            val attempts = mutableListOf<SignUpRegistrationAttempt>()

            val failure = captureFailure {
                repository.submit(
                    submission = patientSubmission(),
                    onAttemptBound = attempts::add,
                )
            }

            assertTrue(failure is CancellationException)
            assertEquals(createdOwner, attempts.last().firebaseOwner)
            assertEquals(attempts.first().operationId, attempts.last().operationId)
        }

    private fun repository(
        firebase: FakeSignUpFirebaseGateway,
        checkpoint: FakeSignUpRegistrationCheckpoint,
    ) = ProductionSignUpRepository(
        firebase = firebase,
        checkpoint = checkpoint,
        catalogLoader = { SignUpCatalog() },
        operationIdFactory = { "signup-operation-production-test" },
    )

    private fun patientSubmission() = SignUpSubmission(
        accountType = SignUpAccountType.Personal,
        name = "Nguyễn An",
        phone = "0901234567",
        email = "patient@shcare.vn",
        password = "secret-123",
    )

    private fun owner(uid: String, email: String, epoch: Long) = FirebaseOwnerBinding(
        firebaseUserId = uid,
        email = email,
        sessionEpoch = epoch,
    )

    private suspend fun captureFailure(block: suspend () -> Unit): Throwable? = try {
        block()
        null
    } catch (error: Throwable) {
        error
    }
}

private class FakeSignUpFirebaseGateway(
    private val events: MutableList<String>,
    initialOwner: FirebaseOwnerBinding? = null,
    private val createdOwner: FirebaseOwnerBinding = FirebaseOwnerBinding(
        firebaseUserId = "firebase-a",
        email = "patient@shcare.vn",
        sessionEpoch = 1L,
    ),
    private val ownerAfterCreate: FirebaseOwnerBinding? = null,
    private val createFailureAfterOwner: Throwable? = null,
) : SignUpFirebaseGateway {
    private var currentOwner = initialOwner
    var createCalls = 0
    var resendCalls = 0

    override fun currentOwnerBindingOrNull(): FirebaseOwnerBinding? = currentOwner

    override fun isCurrentOwner(owner: FirebaseOwnerBinding): Boolean = currentOwner == owner

    override suspend fun createAccount(
        email: String,
        password: String,
        displayName: String,
    ): FirebaseAccountCreationReceipt {
        events += "create-account"
        createCalls += 1
        currentOwner = ownerAfterCreate ?: createdOwner
        createFailureAfterOwner?.let { throw it }
        return FirebaseAccountCreationReceipt(
            firebaseUserId = createdOwner.firebaseUserId,
            email = createdOwner.email,
            idToken = "token",
            ownerSessionEpoch = createdOwner.sessionEpoch,
        )
    }

    override suspend fun resendEmailVerification(owner: FirebaseOwnerBinding) {
        events += "resend-verification"
        resendCalls += 1
    }
}

private class FakeSignUpRegistrationCheckpoint(
    private val events: MutableList<String>,
    private val bindFailure: Throwable? = null,
) : SignUpRegistrationCheckpoint {
    var draft: PendingRegistration? = null
    var boundRegistration: PendingRegistration? = null
    var boundOwner: FirebaseOwnerBinding? = null

    override suspend fun saveDraft(registration: PendingRegistration) {
        events += "save-draft"
        draft = registration
    }

    override suspend fun bindToOwner(
        registration: PendingRegistration,
        owner: FirebaseOwnerBinding,
    ) {
        events += "bind-owner"
        bindFailure?.let { throw it }
        boundRegistration = registration
        boundOwner = owner
    }
}
