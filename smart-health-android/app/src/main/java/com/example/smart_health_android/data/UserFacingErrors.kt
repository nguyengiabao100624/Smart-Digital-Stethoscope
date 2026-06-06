package com.example.smart_health_android.data

import com.google.firebase.FirebaseNetworkException
import com.google.firebase.auth.FirebaseAuthException
import java.io.IOException

fun Throwable.toVietnameseMessage(defaultMessage: String): String {
    val firebaseCode = (this as? FirebaseAuthException)?.errorCode.orEmpty()
    firebaseCodeToVietnamese(firebaseCode)?.let { return it }

    if (this is FirebaseNetworkException) {
        return "Không thể kết nối dịch vụ xác thực. Vui lòng kiểm tra mạng và thử lại."
    }

    val text = message.orEmpty().trim()
    val normalized = text.lowercase()

    return when {
        normalized.contains("email address is already in use") ||
            normalized.contains("already in use by another account") ->
            "Email này đã được sử dụng bởi một tài khoản khác."

        normalized.contains("badly formatted") ||
            normalized.contains("invalid email") ->
            "Địa chỉ email không hợp lệ."

        normalized.contains("password is invalid") ||
            normalized.contains("invalid credential") ||
            normalized.contains("wrong password") ->
            "Email hoặc mật khẩu không đúng."

        normalized.contains("no user record") ||
            normalized.contains("user not found") ->
            "Không tìm thấy tài khoản với email này."

        normalized.contains("password should be at least") ||
            normalized.contains("weak password") ->
            "Mật khẩu cần tối thiểu 8 ký tự và đủ mạnh."

        normalized.contains("network error") ||
            normalized.contains("unable to resolve host") ||
            normalized.contains("failed to connect") ->
            "Không thể kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại."

        normalized.contains("too many requests") ->
            "Bạn thao tác quá nhiều lần. Vui lòng chờ một lúc rồi thử lại."

        this is IOException && text.startsWith("HTTP ") ->
            "Máy chủ chưa phản hồi đúng. Vui lòng thử lại sau."

        text.isNotBlank() && !text.any { it in 'a'..'z' || it in 'A'..'Z' } ->
            text

        text.isNotBlank() && looksVietnamese(text) ->
            text

        else -> defaultMessage
    }
}

private fun firebaseCodeToVietnamese(code: String): String? {
    return when (code) {
        "ERROR_EMAIL_ALREADY_IN_USE" -> "Email này đã được sử dụng bởi một tài khoản khác."
        "ERROR_INVALID_EMAIL" -> "Địa chỉ email không hợp lệ."
        "ERROR_WEAK_PASSWORD" -> "Mật khẩu cần tối thiểu 8 ký tự và đủ mạnh."
        "ERROR_WRONG_PASSWORD",
        "ERROR_INVALID_CREDENTIAL" -> "Email hoặc mật khẩu không đúng."
        "ERROR_USER_NOT_FOUND" -> "Không tìm thấy tài khoản với email này."
        "ERROR_USER_DISABLED" -> "Tài khoản này đã bị khóa. Vui lòng liên hệ quản trị viên."
        "ERROR_OPERATION_NOT_ALLOWED" -> "Phương thức đăng nhập này chưa được bật trên hệ thống xác thực."
        "ERROR_TOO_MANY_REQUESTS" -> "Bạn thao tác quá nhiều lần. Vui lòng chờ một lúc rồi thử lại."
        "ERROR_NETWORK_REQUEST_FAILED" -> "Không thể kết nối dịch vụ xác thực. Vui lòng kiểm tra mạng và thử lại."
        "ERROR_ACCOUNT_EXISTS_WITH_DIFFERENT_CREDENTIAL" -> "Email này đã tồn tại bằng phương thức đăng nhập khác."
        else -> null
    }
}

private fun looksVietnamese(text: String): Boolean {
    val vietnameseMarks = "ăâđêôơưáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ"
    return text.any { vietnameseMarks.contains(it.lowercaseChar()) }
}
