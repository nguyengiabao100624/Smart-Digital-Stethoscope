package com.example.smart_health_android.notifications

import com.example.smart_health_android.data.AppNotification
import com.example.smart_health_android.data.SmartHealthApi

enum class NotificationInboxAction(val wireValue: String) {
    Read("read"),
    ReadAll("read_all"),
    Delete("delete");

    companion object {
        fun fromWire(value: String): NotificationInboxAction =
            entries.firstOrNull { it.wireValue == value }
                ?: throw NotificationInboxConfirmationException(
                    "NOTIFICATION_INBOX_ACTION_MISMATCH",
                )
    }
}

data class NotificationInboxSnapshot(
    val userId: String,
    val workspaceId: String,
    val notifications: List<AppNotification>,
    val updatedAt: String,
)

data class NotificationInboxMutationReceipt(
    val userId: String,
    val workspaceId: String,
    val action: NotificationInboxAction,
    val notification: AppNotification?,
    val notifications: List<AppNotification>,
    val affectedIds: List<String>,
    val deletedId: String?,
    val updatedAt: String,
    val replayed: Boolean,
)

class NotificationInboxOwnershipException(
    message: String,
) : SecurityException(message)

class NotificationInboxConfirmationException(
    message: String,
) : IllegalStateException(message)

interface NotificationInboxRepository {
    suspend fun load(
        expectedUserId: String,
        expectedWorkspaceId: String,
    ): NotificationInboxSnapshot

    suspend fun markRead(
        notificationId: String,
        idempotencyKey: String,
        expectedUserId: String,
        expectedWorkspaceId: String,
    ): NotificationInboxMutationReceipt

    suspend fun markAllRead(
        idempotencyKey: String,
        expectedUserId: String,
        expectedWorkspaceId: String,
    ): NotificationInboxMutationReceipt

    suspend fun delete(
        notificationId: String,
        idempotencyKey: String,
        expectedUserId: String,
        expectedWorkspaceId: String,
    ): NotificationInboxMutationReceipt
}

class ApiNotificationInboxRepository(
    private val api: SmartHealthApi,
) : NotificationInboxRepository {
    override suspend fun load(
        expectedUserId: String,
        expectedWorkspaceId: String,
    ): NotificationInboxSnapshot =
        api.getNotificationInbox().requireOwner(
            expectedUserId = expectedUserId,
            expectedWorkspaceId = expectedWorkspaceId,
        )

    override suspend fun markRead(
        notificationId: String,
        idempotencyKey: String,
        expectedUserId: String,
        expectedWorkspaceId: String,
    ): NotificationInboxMutationReceipt =
        api.markNotificationInboxRead(
            id = notificationId,
            idempotencyKey = idempotencyKey,
        ).requireConfirmation(
            expectedAction = NotificationInboxAction.Read,
            expectedNotificationId = notificationId,
            expectedUserId = expectedUserId,
            expectedWorkspaceId = expectedWorkspaceId,
        )

    override suspend fun markAllRead(
        idempotencyKey: String,
        expectedUserId: String,
        expectedWorkspaceId: String,
    ): NotificationInboxMutationReceipt =
        api.markAllNotificationInboxRead(
            idempotencyKey = idempotencyKey,
        ).requireConfirmation(
            expectedAction = NotificationInboxAction.ReadAll,
            expectedNotificationId = null,
            expectedUserId = expectedUserId,
            expectedWorkspaceId = expectedWorkspaceId,
        )

    override suspend fun delete(
        notificationId: String,
        idempotencyKey: String,
        expectedUserId: String,
        expectedWorkspaceId: String,
    ): NotificationInboxMutationReceipt =
        api.deleteNotificationInboxItem(
            id = notificationId,
            idempotencyKey = idempotencyKey,
        ).requireConfirmation(
            expectedAction = NotificationInboxAction.Delete,
            expectedNotificationId = notificationId,
            expectedUserId = expectedUserId,
            expectedWorkspaceId = expectedWorkspaceId,
        )
}

private fun NotificationInboxSnapshot.requireOwner(
    expectedUserId: String,
    expectedWorkspaceId: String,
): NotificationInboxSnapshot {
    val userId = expectedUserId.trim()
    val workspaceId = expectedWorkspaceId.trim()
    if (
        userId.isEmpty() ||
        workspaceId.isEmpty() ||
        this.userId != userId ||
        this.workspaceId != workspaceId ||
        updatedAt.isBlank()
    ) {
        throw NotificationInboxOwnershipException(
            "NOTIFICATION_INBOX_OWNER_MISMATCH",
        )
    }
    val ids = mutableSetOf<String>()
    notifications.forEach { notification ->
        notification.requireOwner(userId, workspaceId)
        if (!ids.add(notification.id)) {
            throw NotificationInboxConfirmationException(
                "NOTIFICATION_INBOX_DUPLICATE_ID",
            )
        }
    }
    return this
}

private fun AppNotification.requireOwner(
    expectedUserId: String,
    expectedWorkspaceId: String,
): AppNotification {
    if (
        id.isBlank() ||
        userId != expectedUserId ||
        workspaceId != expectedWorkspaceId ||
        (
            organizationId.isNotBlank() &&
                organizationId != expectedWorkspaceId
            ) ||
        inAppStatus in setOf("skipped", "skipped_preference", "disabled")
    ) {
        throw NotificationInboxOwnershipException(
            "NOTIFICATION_INBOX_ITEM_OWNER_MISMATCH",
        )
    }
    return this
}

private fun NotificationInboxMutationReceipt.requireConfirmation(
    expectedAction: NotificationInboxAction,
    expectedNotificationId: String?,
    expectedUserId: String,
    expectedWorkspaceId: String,
): NotificationInboxMutationReceipt {
    NotificationInboxSnapshot(
        userId = userId,
        workspaceId = workspaceId,
        notifications = notifications,
        updatedAt = updatedAt,
    ).requireOwner(
        expectedUserId = expectedUserId,
        expectedWorkspaceId = expectedWorkspaceId,
    )
    if (
        action != expectedAction ||
        affectedIds.any(String::isBlank) ||
        affectedIds.distinct().size != affectedIds.size
    ) {
        throw NotificationInboxConfirmationException(
            "NOTIFICATION_INBOX_MUTATION_MISMATCH",
        )
    }
    when (expectedAction) {
        NotificationInboxAction.Read -> {
            val expectedId = expectedNotificationId.orEmpty()
            val confirmedItem = notification
            if (
                confirmedItem == null ||
                confirmedItem.id != expectedId ||
                !confirmedItem.read ||
                confirmedItem.readAt.isNullOrBlank() ||
                expectedId !in affectedIds ||
                notifications.none {
                    it.id == expectedId &&
                        it.read &&
                        !it.readAt.isNullOrBlank()
                } ||
                deletedId != null
            ) {
                throw NotificationInboxConfirmationException(
                    "NOTIFICATION_INBOX_READ_UNCONFIRMED",
                )
            }
            confirmedItem.requireOwner(expectedUserId, expectedWorkspaceId)
        }

        NotificationInboxAction.ReadAll -> {
            if (
                notification != null ||
                deletedId != null ||
                notifications.any { !it.read || it.readAt.isNullOrBlank() } ||
                notifications.any { it.id !in affectedIds }
            ) {
                throw NotificationInboxConfirmationException(
                    "NOTIFICATION_INBOX_READ_ALL_UNCONFIRMED",
                )
            }
        }

        NotificationInboxAction.Delete -> {
            val expectedId = expectedNotificationId.orEmpty()
            val confirmedItem = notification
            if (
                confirmedItem == null ||
                confirmedItem.id != expectedId ||
                deletedId != expectedId ||
                expectedId !in affectedIds ||
                notifications.any { it.id == expectedId }
            ) {
                throw NotificationInboxConfirmationException(
                    "NOTIFICATION_INBOX_DELETE_UNCONFIRMED",
                )
            }
            confirmedItem.requireOwner(expectedUserId, expectedWorkspaceId)
        }
    }
    return this
}
