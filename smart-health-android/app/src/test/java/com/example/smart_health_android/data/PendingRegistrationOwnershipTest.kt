package com.example.smart_health_android.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PendingRegistrationOwnershipTest {
    @Test
    fun `legacy checkpoint binds only when normalized email matches current Firebase owner`() {
        val registration = PendingRegistration(
            accountType = "doctor",
            name = "Bác sĩ An",
            email = " Doctor@Example.COM ",
            phone = "0912345678",
        )

        val bound = registration.bindToFirebaseOwner(
            firebaseUserId = "firebase-user-1",
            firebaseEmail = "doctor@example.com",
            idempotencyKeyFactory = { "role-request-key-1" },
        )

        requireNotNull(bound)
        assertEquals("firebase-user-1", bound.firebaseUserId)
        assertEquals("doctor@example.com", bound.email)
        assertEquals("role-request-key-1", bound.roleRequestIdempotencyKey)
    }

    @Test
    fun `legacy checkpoint cannot bind to a different normalized email`() {
        val registration = PendingRegistration(
            accountType = "personal",
            name = "An",
            email = "owner@example.com",
            phone = "",
        )

        assertNull(
            registration.bindToFirebaseOwner(
                firebaseUserId = "firebase-user-2",
                firebaseEmail = "other@example.com",
                idempotencyKeyFactory = { "must-not-be-used" },
            ),
        )
    }

    @Test
    fun `bound checkpoint cannot move to another Firebase uid even with the same email`() {
        val registration = PendingRegistration(
            accountType = "personal",
            name = "An",
            email = "owner@example.com",
            phone = "",
            firebaseUserId = "firebase-user-1",
            roleRequestIdempotencyKey = "role-request-key-1",
        )

        assertNull(
            registration.bindToFirebaseOwner(
                firebaseUserId = "firebase-user-2",
                firebaseEmail = "owner@example.com",
                idempotencyKeyFactory = { "must-not-be-used" },
            ),
        )
    }

    @Test
    fun `existing owner keeps the same stable role request idempotency key`() {
        val registration = PendingRegistration(
            accountType = "solo_doctor",
            name = "Bác sĩ An",
            email = "doctor@example.com",
            phone = "",
            firebaseUserId = "firebase-user-1",
            roleRequestIdempotencyKey = "role-request-key-stable",
        )

        val rebound = registration.bindToFirebaseOwner(
            firebaseUserId = "firebase-user-1",
            firebaseEmail = "DOCTOR@example.com",
            idempotencyKeyFactory = { "replacement-key" },
        )

        requireNotNull(rebound)
        assertEquals("role-request-key-stable", rebound.roleRequestIdempotencyKey)
    }
}
