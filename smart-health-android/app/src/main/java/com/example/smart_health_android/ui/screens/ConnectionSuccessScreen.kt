package com.example.smart_health_android.ui.screens

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.example.smart_health_android.R
import com.example.smart_health_android.ui.theme.ShcareTheme

@Composable
fun ConnectionSuccessScreen(
    deviceName: String,
    onFinish: () -> Unit,
) {
    var visible by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(
        targetValue = if (visible) 1f else 0.88f,
        animationSpec = tween(ShcareTheme.motion.emphasizedMillis),
        label = "device-online-confirmation",
    )
    val resolvedDeviceName = deviceName.ifBlank { stringResource(R.string.device_pairing_title) }

    LaunchedEffect(Unit) { visible = true }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(ShcareTheme.spacing.extraLarge)
            .testTag("device_pairing.success"),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Spacer(Modifier.weight(1f))
        Surface(
            modifier = Modifier
                .size(88.dp)
                .scale(scale),
            shape = CircleShape,
            color = ShcareTheme.colors.successContainer,
            contentColor = ShcareTheme.colors.onSuccessContainer,
        ) {
            Icon(
                imageVector = Icons.Default.Check,
                contentDescription = null,
                modifier = Modifier.padding(ShcareTheme.spacing.extraLarge),
            )
        }
        Spacer(Modifier.height(ShcareTheme.spacing.extraLarge))
        Text(
            text = stringResource(R.string.device_pairing_success_title),
            style = MaterialTheme.typography.headlineSmall,
            textAlign = TextAlign.Center,
            modifier = Modifier.semantics { heading() },
        )
        Spacer(Modifier.height(ShcareTheme.spacing.small))
        Text(
            text = stringResource(R.string.device_pairing_success_message, resolvedDeviceName),
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.weight(1f))
        Button(
            onClick = onFinish,
            modifier = Modifier
                .fillMaxWidth()
                .defaultMinSize(minHeight = 48.dp)
                .testTag("device_pairing.success_continue"),
        ) {
            Text(stringResource(R.string.device_pairing_success_continue))
        }
    }
}
