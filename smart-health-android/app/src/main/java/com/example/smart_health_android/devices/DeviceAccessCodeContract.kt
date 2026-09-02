package com.example.smart_health_android.devices

import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

private val DeviceAccessCodePattern = Regex("^SHC-[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){3}$")

fun normalizeDeviceAccessCode(value: String): String? {
    val compact = value.trim()
        .take(120)
        .uppercase()
        .filter(Char::isLetterOrDigit)
    if (!compact.startsWith("SHC") || compact.length != 19) return null
    val body = compact.drop(3)
    val formatted = "SHC-${body.chunked(4).joinToString("-")}"
    return formatted.takeIf(DeviceAccessCodePattern::matches)
}

fun parseDeviceAccessCode(value: String): String? {
    val trimmed = value.trim()
    if (!trimmed.startsWith("shcare://", ignoreCase = true)) {
        return normalizeDeviceAccessCode(trimmed)
    }
    val uri = runCatching { URI(trimmed) }.getOrNull() ?: return null
    if (
        !uri.scheme.equals("shcare", ignoreCase = true) ||
        !uri.host.equals("device-access", ignoreCase = true) ||
        uri.path?.takeIf(String::isNotBlank) != null
    ) {
        return null
    }
    val query = uri.rawQuery.orEmpty()
        .split('&')
        .mapNotNull { field ->
            val separator = field.indexOf('=')
            if (separator <= 0) return@mapNotNull null
            val key = URLDecoder.decode(field.take(separator), StandardCharsets.UTF_8.name())
            val value = URLDecoder.decode(field.drop(separator + 1), StandardCharsets.UTF_8.name())
            key to value
        }
        .toMap()
    if (query["v"] != "1" || query.keys != setOf("v", "code")) return null
    return normalizeDeviceAccessCode(query["code"].orEmpty())
}
