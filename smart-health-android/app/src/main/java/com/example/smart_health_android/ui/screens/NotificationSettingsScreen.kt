package com.example.smart_health_android.ui.screens

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Message
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.toVietnameseMessage
import com.example.smart_health_android.notifications.NotificationPermissionDecision
import com.example.smart_health_android.notifications.NotificationPermissionPolicy
import com.example.smart_health_android.notifications.NotificationPreferenceField
import com.example.smart_health_android.notifications.NotificationPreferenceMutation
import com.example.smart_health_android.ui.theme.*
import kotlinx.coroutines.launch
import org.json.JSONObject

private fun Context.hasPostNotificationsPermission(): Boolean {
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
        ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
}

private fun JSONObject.toBooleanPreferenceMap(): Map<String, Boolean> {
    val preferences = linkedMapOf<String, Boolean>()
    val keys = keys()
    while (keys.hasNext()) {
        val key = keys.next()
        if (opt(key) is Boolean) preferences[key] = optBoolean(key)
    }
    return preferences
}

private fun Map<String, Boolean>.toJsonObject(): JSONObject {
    return JSONObject().also { json ->
        forEach { (key, value) -> json.put(key, value) }
    }
}

@Composable
fun NotificationSettingsScreen(onNavigateBack: () -> Unit) {
    val context = LocalContext.current
    var enabled by remember { mutableStateOf(true) }
    var sound by remember { mutableStateOf(true) }
    var vibration by remember { mutableStateOf(true) }
    
    var abnormalResults by remember { mutableStateOf(true) }
    var deviceConnection by remember { mutableStateOf(true) }
    var appointments by remember { mutableStateOf(true) }
    var aiUpdates by remember { mutableStateOf(false) }
    var messages by remember { mutableStateOf(true) }
    var isLoading by remember { mutableStateOf(true) }
    var isSaving by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var statusMessage by remember { mutableStateOf<String?>(null) }
    var showNotificationPrePrompt by remember { mutableStateOf(false) }
    val coroutineScope = rememberCoroutineScope()

    fun currentPreference(field: NotificationPreferenceField): Boolean {
        return when (field) {
            NotificationPreferenceField.Enabled -> enabled
            NotificationPreferenceField.Sound -> sound
            NotificationPreferenceField.Vibration -> vibration
            NotificationPreferenceField.AbnormalResults -> abnormalResults
            NotificationPreferenceField.DeviceOffline -> deviceConnection
            NotificationPreferenceField.Appointments -> appointments
            NotificationPreferenceField.AiUpdates -> aiUpdates
            NotificationPreferenceField.Messages -> messages
        }
    }

    fun applyPreference(field: NotificationPreferenceField, value: Boolean) {
        when (field) {
            NotificationPreferenceField.Enabled -> enabled = value
            NotificationPreferenceField.Sound -> sound = value
            NotificationPreferenceField.Vibration -> vibration = value
            NotificationPreferenceField.AbnormalResults -> abnormalResults = value
            NotificationPreferenceField.DeviceOffline -> deviceConnection = value
            NotificationPreferenceField.Appointments -> appointments = value
            NotificationPreferenceField.AiUpdates -> aiUpdates = value
            NotificationPreferenceField.Messages -> messages = value
        }
    }

    fun applyPreferences(preferences: JSONObject) {
        enabled = preferences.optBoolean("enabled", true)
        sound = preferences.optBoolean("sound", true)
        vibration = preferences.optBoolean("vibration", true)
        abnormalResults = preferences.optBoolean("abnormalResults", true)
        deviceConnection = preferences.optBoolean("deviceOffline", true)
        appointments = preferences.optBoolean("appointments", true)
        aiUpdates = preferences.optBoolean("aiUpdates", false)
        messages = preferences.optBoolean("messages", true)
    }

    fun persistPreference(
        mutation: NotificationPreferenceMutation,
        successMessage: String = "Đã lưu tùy chọn thông báo",
    ) {
        val previousValue = currentPreference(mutation.field)
        applyPreference(mutation.field, mutation.value)
        isSaving = true
        errorMessage = null
        statusMessage = null
        coroutineScope.launch {
            try {
                val currentPreferences = SmartHealthRepository.api
                    .getMe()
                    .notificationPreferences
                    .toBooleanPreferenceMap()
                val nextPreferences = mutation
                    .requestFields(currentPreferences)
                    .getValue("notificationPreferences")
                val user = SmartHealthRepository.api.updateMe(
                    JSONObject().put("notificationPreferences", nextPreferences.toJsonObject())
                )
                applyPreferences(user.notificationPreferences)
                statusMessage = successMessage
            } catch (exception: Exception) {
                applyPreference(mutation.field, previousValue)
                errorMessage = exception.toVietnameseMessage("Không thể lưu tùy chọn thông báo")
            } finally {
                isSaving = false
            }
        }
    }

    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        val decision = NotificationPermissionPolicy.onPermissionResult(granted)
        persistPreference(
            mutation = decision.mutation,
            successMessage = if (granted) {
                "Đã bật thông báo"
            } else {
                "Chưa cấp quyền; thông báo vẫn đang tắt"
            },
        )
    }

    LaunchedEffect(Unit) {
        isLoading = true
        errorMessage = null
        runCatching {
            applyPreferences(SmartHealthRepository.api.getMe().notificationPreferences)
        }.onFailure {
            errorMessage = it.toVietnameseMessage("Không thể tải tùy chọn thông báo")
        }
        isLoading = false
    }

    if (showNotificationPrePrompt) {
        AlertDialog(
            onDismissRequest = { showNotificationPrePrompt = false },
            title = { Text("Cho phép thông báo") },
            text = {
                Text("Smart Health cần quyền thông báo để gửi cảnh báo kết quả bất thường, trạng thái ống nghe và nhắc lịch khám.")
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showNotificationPrePrompt = false
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                        } else {
                            persistPreference(
                                NotificationPreferenceMutation(NotificationPreferenceField.Enabled, true)
                            )
                        }
                    }
                ) {
                    Text("Tiếp tục")
                }
            },
            dismissButton = {
                TextButton(onClick = { showNotificationPrePrompt = false }) {
                    Text("Để sau")
                }
            }
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
    ) {
        // Gradient Header
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(Brush.linearGradient(listOf(PrimaryBlue, PrimaryTeal)))
                .padding(start = 16.dp, end = 16.dp, top = 48.dp, bottom = 24.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onNavigateBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Quay lại", tint = Color.White)
                }
                Spacer(modifier = Modifier.width(8.dp))
                Column {
                    Text("Tùy chọn thông báo", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
                    Text("Quản lý cảnh báo và nhắc nhở", color = Color.White.copy(alpha = 0.8f), fontSize = 14.sp)
                }
            }
        }

        // Scrollable Content
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(24.dp)
        ) {
            if (isLoading || isSaving) {
                LinearProgressIndicator(
                    modifier = Modifier.fillMaxWidth(),
                    color = PrimaryTeal,
                    trackColor = Border
                )
            }
            errorMessage?.let { message ->
                Text(
                    text = message,
                    color = MaterialTheme.colorScheme.error,
                    fontSize = 13.sp,
                    modifier = Modifier.padding(horizontal = 8.dp)
                )
            }
            statusMessage?.let { message ->
                Text(
                    text = message,
                    color = Color(0xFF047857),
                    fontSize = 13.sp,
                    modifier = Modifier.padding(horizontal = 8.dp)
                )
            }
            // Section 1: Tổng Quan
            Column {
                Text("TỔNG QUAN", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp, modifier = Modifier.padding(start = 8.dp, bottom = 12.dp))
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White, RoundedCornerShape(16.dp))
                        .border(1.dp, Border, RoundedCornerShape(16.dp))
                ) {
                    NotificationToggleRow(
                        icon = Icons.Default.NotificationsActive,
                        iconColor = PrimaryBlue,
                        title = "Bật thông báo",
                        subtitle = "Nhận tất cả thông báo",
                        checked = enabled,
                        onCheckedChange = { requestedEnabled ->
                            when (
                                val decision = NotificationPermissionPolicy.onToggle(
                                    requestedEnabled = requestedEnabled,
                                    hasSystemPermission = context.hasPostNotificationsPermission(),
                                )
                            ) {
                                NotificationPermissionDecision.RequestSystemPermission -> {
                                    showNotificationPrePrompt = true
                                }
                                is NotificationPermissionDecision.Persist -> {
                                    persistPreference(decision.mutation)
                                }
                            }
                        },
                        enabled = !isLoading && !isSaving,
                        showDivider = true
                    )
                    NotificationToggleRow(
                        icon = Icons.AutoMirrored.Filled.VolumeUp,
                        iconColor = Color(0xFF8B5CF6),
                        title = "Âm thanh",
                        subtitle = "Phát âm thanh cảnh báo",
                        checked = sound && enabled,
                        onCheckedChange = {
                            persistPreference(
                                NotificationPreferenceMutation(NotificationPreferenceField.Sound, it)
                            )
                        },
                        enabled = enabled && !isLoading && !isSaving,
                        showDivider = true
                    )
                    NotificationToggleRow(
                        icon = Icons.Default.Vibration,
                        iconColor = Color(0xFFF97316),
                        title = "Rung",
                        subtitle = "Rung khi có thông báo",
                        checked = vibration && enabled,
                        onCheckedChange = {
                            persistPreference(
                                NotificationPreferenceMutation(NotificationPreferenceField.Vibration, it)
                            )
                        },
                        enabled = enabled && !isLoading && !isSaving,
                        showDivider = false
                    )
                }
            }

            // Section 2: Loại Thông Báo
            Column {
                Text("LOẠI THÔNG BÁO", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp, modifier = Modifier.padding(start = 8.dp, bottom = 12.dp))
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White, RoundedCornerShape(16.dp))
                        .border(1.dp, Border, RoundedCornerShape(16.dp))
                        .alpha(if (enabled) 1f else 0.5f)
                ) {
                    NotificationToggleRow(
                        icon = Icons.Default.Warning,
                        iconColor = Color(0xFFEF4444),
                        title = "Kết quả bất thường",
                        subtitle = "Cảnh báo khi phát hiện dấu hiệu bất thường",
                        checked = abnormalResults && enabled,
                        onCheckedChange = {
                            persistPreference(
                                NotificationPreferenceMutation(NotificationPreferenceField.AbnormalResults, it)
                            )
                        },
                        enabled = enabled && !isLoading && !isSaving,
                        showDivider = true
                    )
                    NotificationToggleRow(
                        icon = Icons.Default.CheckCircle,
                        iconColor = Color(0xFF3B82F6),
                        title = "Kết nối thiết bị",
                        subtitle = "Thông báo trạng thái ống nghe",
                        checked = deviceConnection && enabled,
                        onCheckedChange = {
                            persistPreference(
                                NotificationPreferenceMutation(NotificationPreferenceField.DeviceOffline, it)
                            )
                        },
                        enabled = enabled && !isLoading && !isSaving,
                        showDivider = true
                    )
                    NotificationToggleRow(
                        icon = Icons.Default.Event,
                        iconColor = Color(0xFF10B981),
                        title = "Lịch hẹn",
                        subtitle = "Nhắc nhở lịch khám bệnh",
                        checked = appointments && enabled,
                        onCheckedChange = {
                            persistPreference(
                                NotificationPreferenceMutation(NotificationPreferenceField.Appointments, it)
                            )
                        },
                        enabled = enabled && !isLoading && !isSaving,
                        showDivider = true
                    )
                    NotificationToggleRow(
                        icon = Icons.AutoMirrored.Filled.Message,
                        iconColor = Color(0xFF00A896),
                        title = "Tin nhắn",
                        subtitle = "Trao đổi phân tích và hỗ trợ",
                        checked = messages && enabled,
                        onCheckedChange = {
                            persistPreference(
                                NotificationPreferenceMutation(NotificationPreferenceField.Messages, it)
                            )
                        },
                        enabled = enabled && !isLoading && !isSaving,
                        showDivider = true
                    )
                    NotificationToggleRow(
                        icon = Icons.Default.Info,
                        iconColor = Color(0xFF8B5CF6),
                        title = "Cập nhật phân tích tín hiệu",
                        subtitle = "Thay đổi bộ kiểm tra chất lượng tín hiệu",
                        checked = aiUpdates && enabled,
                        onCheckedChange = {
                            persistPreference(
                                NotificationPreferenceMutation(NotificationPreferenceField.AiUpdates, it)
                            )
                        },
                        enabled = enabled && !isLoading && !isSaving,
                        showDivider = false
                    )
                }
            }

            // Alert Box
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFFEFF6FF), RoundedCornerShape(16.dp))
                    .border(1.dp, Color(0xFFBFDBFE), RoundedCornerShape(16.dp))
                    .padding(16.dp),
                verticalAlignment = Alignment.Top
            ) {
                Icon(Icons.Default.Info, contentDescription = null, tint = Color(0xFF2563EB), modifier = Modifier.padding(top = 2.dp))
                Spacer(modifier = Modifier.width(12.dp))
                Column {
                    Text("Lưu ý", color = Color(0xFF1E3A8A), fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        "Khuyến nghị bật thông báo \"Kết quả bất thường\" để nhận cảnh báo kịp thời về tình trạng sức khỏe bệnh nhân.",
                        color = Color(0xFF1E40AF),
                        fontSize = 14.sp,
                        lineHeight = 20.sp
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

@Composable
fun NotificationToggleRow(
    icon: ImageVector,
    iconColor: Color,
    title: String,
    subtitle: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    enabled: Boolean = true,
    showDivider: Boolean
) {
    Column(modifier = Modifier.alpha(if (enabled) 1f else 0.5f)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(enabled = enabled) { onCheckedChange(!checked) }
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .background(iconColor.copy(alpha = 0.1f), RoundedCornerShape(12.dp)),
                contentAlignment = Alignment.Center
            ) {
                Icon(icon, contentDescription = null, tint = iconColor, modifier = Modifier.size(20.dp))
            }
            Spacer(modifier = Modifier.width(16.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(title, color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                Text(subtitle, color = TextSecondary, fontSize = 14.sp)
            }
            Spacer(modifier = Modifier.width(16.dp))
            Switch(
                checked = checked,
                onCheckedChange = onCheckedChange,
                enabled = enabled,
                colors = SwitchDefaults.colors(
                    checkedThumbColor = Color.White,
                    checkedTrackColor = Color(0xFF10B981),
                    uncheckedThumbColor = Color.White,
                    uncheckedTrackColor = Color(0xFFE2E8F0)
                )
            )
        }
        if (showDivider) {
            HorizontalDivider(color = Border, modifier = Modifier.padding(horizontal = 16.dp))
        }
    }
}
