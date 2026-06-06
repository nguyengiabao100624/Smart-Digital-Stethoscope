package com.example.smart_health_android.data

import android.content.Context
import org.json.JSONObject

data class PendingRegistration(
    val accountType: String,
    val name: String,
    val email: String,
    val phone: String,
    val license: String = "",
    val hospital: String = "",
    val department: String = "",
    val organizationId: String = "",
    val reason: String = ""
)

object PendingRegistrationStore {
    private const val PREFS_NAME = "smart_health_pending_registration"
    private const val KEY_PAYLOAD = "payload"

    @Volatile
    var current: PendingRegistration? = null

    fun save(context: Context, registration: PendingRegistration) {
        current = registration
        context.applicationContext
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_PAYLOAD, registration.toJson().toString())
            .apply()
    }

    fun load(context: Context): PendingRegistration? {
        current?.let { return it }
        val raw = context.applicationContext
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_PAYLOAD, null)
            ?: return null
        return runCatching {
            val json = JSONObject(raw)
            PendingRegistration(
                accountType = json.optString("accountType"),
                name = json.optString("name"),
                email = json.optString("email"),
                phone = json.optString("phone"),
                license = json.optString("license"),
                hospital = json.optString("hospital"),
                department = json.optString("department"),
                organizationId = json.optString("organizationId"),
                reason = json.optString("reason")
            )
        }.getOrNull().also { current = it }
    }

    fun clear(context: Context? = null) {
        current = null
        context?.applicationContext
            ?.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            ?.edit()
            ?.remove(KEY_PAYLOAD)
            ?.apply()
    }

    private fun PendingRegistration.toJson(): JSONObject {
        return JSONObject()
            .put("accountType", accountType)
            .put("name", name)
            .put("email", email)
            .put("phone", phone)
            .put("license", license)
            .put("hospital", hospital)
            .put("department", department)
            .put("organizationId", organizationId)
            .put("reason", reason)
    }
}
