package com.example.smart_health_android.data

import java.io.IOException

class SmartHealthApiException(
    val statusCode: Int,
    val code: String,
    val fieldErrors: Map<String, String> = emptyMap(),
    val details: Map<String, String> = emptyMap(),
    val requestId: String = "",
    message: String,
) : IOException(message)

fun SmartHealthApiException.twoFactorChallengeOrNull(): TwoFactorChallenge? {
    if (code !in setOf("TWO_FACTOR_REQUIRED", "TWO_FACTOR_CHALLENGE_REQUIRED")) return null
    val challengeId = details["challengeId"].orEmpty()
    val method = details["method"].orEmpty()
    val expiresAt = details["expiresAt"].orEmpty()
    if (challengeId.isBlank() || method != "app" || expiresAt.isBlank()) return null
    return TwoFactorChallenge(challengeId, method, expiresAt)
}
