package com.example.smart_health_android.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import kotlin.math.min

/**
 * Native Compose rendering of the canonical Shcare signal mark.
 *
 * Geometry matches packages/shcare-brand/assets/shcare-symbol.svg while
 * colors resolve from the Android Material theme instead of Web tokens.
 */
@Composable
fun ShcareSignalMark(
    contentDescription: String,
    modifier: Modifier = Modifier,
    primaryColor: Color = MaterialTheme.colorScheme.primary,
    vitalColor: Color = MaterialTheme.colorScheme.secondary,
) {
    Canvas(
        modifier = modifier
            .aspectRatio(1f)
            .semantics {
                this.contentDescription = contentDescription
            },
    ) {
        val scale = min(size.width, size.height) / MarkViewport
        val horizontalOffset = (size.width - MarkViewport * scale) / 2f
        val verticalOffset = (size.height - MarkViewport * scale) / 2f
        val stroke = Stroke(
            width = MarkStrokeWidth,
            cap = StrokeCap.Round,
            join = StrokeJoin.Round,
        )

        withTransform({
            translate(left = horizontalOffset, top = verticalOffset)
            scale(scaleX = scale, scaleY = scale, pivot = Offset.Zero)
        }) {
            drawPath(path = upperSignalPath(), color = primaryColor, style = stroke)
            drawPath(path = lowerSignalPath(), color = vitalColor, style = stroke)
        }
    }
}

private fun upperSignalPath() = Path().apply {
    moveTo(10f, 19f)
    cubicTo(18f, 8f, 43f, 8f, 52f, 17f)
    cubicTo(58f, 23f, 54f, 30f, 46f, 32f)
    lineTo(35f, 35f)
}

private fun lowerSignalPath() = Path().apply {
    moveTo(29f, 29f)
    lineTo(24f, 38f)
    lineTo(20f, 32f)
    lineTo(17f, 34f)
    cubicTo(10f, 37f, 8f, 43f, 13f, 49f)
    cubicTo(22f, 58f, 45f, 56f, 53f, 44f)
}

private const val MarkViewport = 64f
private const val MarkStrokeWidth = 6f
