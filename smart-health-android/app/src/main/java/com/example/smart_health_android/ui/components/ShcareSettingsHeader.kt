package com.example.smart_health_android.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.smart_health_android.R
import com.example.smart_health_android.ui.theme.ShcareTheme

@Composable
fun ShcareSettingsHeader(
    title: String,
    onNavigateBack: () -> Unit,
    modifier: Modifier = Modifier,
    actions: @Composable RowScope.() -> Unit = {},
) {
    ShcareGradientTopAppBar(
        title = title,
        onNavigateBack = onNavigateBack,
        modifier = modifier,
        actions = actions,
    )
}

/**
 * Canonical mobile top bar based on the original Shcare/Figma visual language.
 * It is intentionally native Compose and is not shared with the Web design system.
 */
@Composable
fun ShcareGradientTopAppBar(
    title: String,
    onNavigateBack: (() -> Unit)?,
    subtitle: String? = null,
    modifier: Modifier = Modifier,
    backContentDescription: String = stringResource(R.string.shcare_action_back),
    backModifier: Modifier = Modifier,
    backEnabled: Boolean = true,
    titleModifier: Modifier = Modifier,
    actions: @Composable RowScope.() -> Unit = {},
) {
    val colors = ShcareTheme.colors
    val shape = RoundedCornerShape(bottomStart = 18.dp, bottomEnd = 18.dp)
    CompositionLocalProvider(LocalContentColor provides colors.onBrandHeader) {
        Row(
            modifier = modifier
                .fillMaxWidth()
                .shadow(elevation = 5.dp, shape = shape, clip = false)
                .clip(shape)
                .background(
                    Brush.linearGradient(
                        listOf(colors.brandHeaderStart, colors.brandHeaderEnd),
                    ),
                )
                .statusBarsPadding()
                .defaultMinSize(minHeight = 64.dp)
                .padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (onNavigateBack != null) {
                IconButton(
                    onClick = onNavigateBack,
                    enabled = backEnabled,
                    modifier = backModifier.defaultMinSize(minWidth = 48.dp, minHeight = 48.dp),
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = backContentDescription,
                        tint = colors.onBrandHeader,
                    )
                }
            }
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(start = if (onNavigateBack == null) 16.dp else 4.dp)
                    .then(titleModifier)
                    .semantics { heading() },
            ) {
                Text(
                    text = title,
                    color = colors.onBrandHeader,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                )
                subtitle?.takeIf(String::isNotBlank)?.let { value ->
                    Text(
                        text = value,
                        color = colors.onBrandHeader.copy(alpha = 0.88f),
                        style = MaterialTheme.typography.labelMedium,
                        maxLines = 1,
                    )
                }
            }
            actions()
        }
    }
}
