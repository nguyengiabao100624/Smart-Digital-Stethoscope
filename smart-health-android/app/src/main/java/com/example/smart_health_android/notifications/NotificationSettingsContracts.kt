package com.example.smart_health_android.notifications

data class NotificationPreferenceOwnership(
    val kind: String,
    val userId: String,
)

data class NotificationCloudPreferences(
    val enabled: Boolean,
    val doctorRequests: Boolean,
    val abnormalResults: Boolean,
    val deviceOffline: Boolean,
    val appointments: Boolean,
    val messages: Boolean,
    val aiUpdates: Boolean,
    val newLogin: Boolean,
) {
    operator fun get(field: NotificationPreferenceField): Boolean = when (field) {
        NotificationPreferenceField.Enabled -> enabled
        NotificationPreferenceField.DoctorRequests -> doctorRequests
        NotificationPreferenceField.AbnormalResults -> abnormalResults
        NotificationPreferenceField.DeviceOffline -> deviceOffline
        NotificationPreferenceField.Appointments -> appointments
        NotificationPreferenceField.Messages -> messages
        NotificationPreferenceField.AiUpdates -> aiUpdates
        NotificationPreferenceField.NewLogin -> newLogin
    }

    fun with(field: NotificationPreferenceField, value: Boolean): NotificationCloudPreferences =
        when (field) {
            NotificationPreferenceField.Enabled -> copy(enabled = value)
            NotificationPreferenceField.DoctorRequests -> copy(doctorRequests = value)
            NotificationPreferenceField.AbnormalResults -> copy(abnormalResults = value)
            NotificationPreferenceField.DeviceOffline -> copy(deviceOffline = value)
            NotificationPreferenceField.Appointments -> copy(appointments = value)
            NotificationPreferenceField.Messages -> copy(messages = value)
            NotificationPreferenceField.AiUpdates -> copy(aiUpdates = value)
            NotificationPreferenceField.NewLogin -> copy(newLogin = value)
        }
}

data class NotificationChannelAvailability(
    val available: Boolean,
    val status: String,
    val reasonCode: String,
) {
    val ready: Boolean
        get() = available && status == "ready"
}

data class NotificationChannelAvailabilitySet(
    val inApp: NotificationChannelAvailability,
    val email: NotificationChannelAvailability,
    val push: NotificationChannelAvailability,
)

data class NotificationPreferencesSnapshot(
    val userId: String,
    val workspaceId: String,
    val ownership: NotificationPreferenceOwnership,
    val preferences: NotificationCloudPreferences,
    val channels: NotificationChannelAvailabilitySet,
    val updatedAt: String,
    val replayed: Boolean = false,
)

data class NotificationRuntimeReadiness(
    val firebaseConfigured: Boolean = false,
    val runtimePermissionGranted: Boolean = false,
    val appNotificationsEnabled: Boolean = false,
    val channelEnabled: Boolean = false,
    val encryptedSessionMatches: Boolean = false,
) {
    val ready: Boolean
        get() = firebaseConfigured &&
            runtimePermissionGranted &&
            appNotificationsEnabled &&
            channelEnabled &&
            encryptedSessionMatches
}
