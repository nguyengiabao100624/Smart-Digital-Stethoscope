package com.example.smart_health_android.ui.components

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MonitorHeart
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Today
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.MonitorHeart
import androidx.compose.material.icons.outlined.People
import androidx.compose.material.icons.outlined.Today
import androidx.compose.material.icons.outlined.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import com.example.smart_health_android.R
import com.example.smart_health_android.navigation.ShcareMobileRoute
import com.example.smart_health_android.navigation.ShcarePrimaryDestination
import com.example.smart_health_android.navigation.ShcarePrimaryDestinationId

private const val NavigationRailBreakpointDp = 600f
private const val TwoPaneBreakpointDp = 840f
private const val AccessibleSinglePaneFontScale = 1.5f
private const val NavigationLabelMaxLines = 2

enum class ShcareAdaptiveLayoutMode {
    Compact,
    NavigationRail,
    TwoPane,
}

fun resolveShcareAdaptiveLayoutMode(
    widthDp: Float,
    fontScale: Float,
): ShcareAdaptiveLayoutMode = when {
    widthDp < NavigationRailBreakpointDp -> ShcareAdaptiveLayoutMode.Compact
    widthDp >= TwoPaneBreakpointDp &&
        fontScale.isFinite() &&
        fontScale < AccessibleSinglePaneFontScale -> ShcareAdaptiveLayoutMode.TwoPane
    else -> ShcareAdaptiveLayoutMode.NavigationRail
}

private val LocalShcareAdaptiveLayoutMode =
    staticCompositionLocalOf<ShcareAdaptiveLayoutMode?> { null }

enum class ShcareNavigationType {
    BottomBar,
    NavigationRail,
}

fun resolveShcareNavigationType(widthDp: Int): ShcareNavigationType =
    when (resolveShcareAdaptiveLayoutMode(widthDp = widthDp.toFloat(), fontScale = 1f)) {
        ShcareAdaptiveLayoutMode.Compact -> ShcareNavigationType.BottomBar
        ShcareAdaptiveLayoutMode.NavigationRail,
        ShcareAdaptiveLayoutMode.TwoPane,
        -> ShcareNavigationType.NavigationRail
    }

enum class ShcareListDetailState {
    NoSelection,
    SelectionInList,
    DetailVisible,
}

enum class ShcareDetailPanePresentation {
    FullScreen,
    SideBySide,
}

@Immutable
data class ShcareNavigationItem(
    val destination: ShcarePrimaryDestination,
    @param:StringRes val labelRes: Int,
    val selectedIcon: ImageVector,
    val unselectedIcon: ImageVector,
)

fun ShcarePrimaryDestination.toShcareNavigationItem(): ShcareNavigationItem =
    when (id) {
        ShcarePrimaryDestinationId.Overview -> ShcareNavigationItem(
            destination = this,
            labelRes = R.string.shcare_nav_overview,
            selectedIcon = Icons.Filled.Home,
            unselectedIcon = Icons.Outlined.Home,
        )
        ShcarePrimaryDestinationId.Measure -> ShcareNavigationItem(
            destination = this,
            labelRes = R.string.shcare_nav_measure,
            selectedIcon = Icons.Filled.MonitorHeart,
            unselectedIcon = Icons.Outlined.MonitorHeart,
        )
        ShcarePrimaryDestinationId.Records -> ShcareNavigationItem(
            destination = this,
            labelRes = R.string.shcare_nav_records,
            selectedIcon = Icons.Filled.Description,
            unselectedIcon = Icons.Outlined.Description,
        )
        ShcarePrimaryDestinationId.Account -> ShcareNavigationItem(
            destination = this,
            labelRes = R.string.shcare_nav_account,
            selectedIcon = Icons.Filled.AccountCircle,
            unselectedIcon = Icons.Outlined.AccountCircle,
        )
        ShcarePrimaryDestinationId.Today -> ShcareNavigationItem(
            destination = this,
            labelRes = R.string.shcare_nav_today,
            selectedIcon = Icons.Filled.Today,
            unselectedIcon = Icons.Outlined.Today,
        )
        ShcarePrimaryDestinationId.Patients -> ShcareNavigationItem(
            destination = this,
            labelRes = R.string.shcare_nav_patients,
            selectedIcon = Icons.Filled.People,
            unselectedIcon = Icons.Outlined.People,
        )
        ShcarePrimaryDestinationId.Alerts -> ShcareNavigationItem(
            destination = this,
            labelRes = R.string.shcare_nav_alerts,
            selectedIcon = Icons.Filled.Warning,
            unselectedIcon = Icons.Outlined.Warning,
        )
    }

/**
 * Adaptive native app shell.
 *
 * The content receives a modifier that already accounts for the bottom bar on compact screens.
 * Existing screens remain responsible for their own top/IME insets, avoiding double insets while
 * the legacy screens are migrated slice by slice.
 */
@Composable
fun ShcareScaffold(
    items: List<ShcareNavigationItem>,
    selectedRoute: ShcareMobileRoute?,
    onDestinationSelected: (ShcarePrimaryDestination) -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable (Modifier) -> Unit,
) {
    BoxWithConstraints(
        modifier = modifier
            .fillMaxSize()
            .testTag("shcare.scaffold"),
    ) {
        val availableWidthDp = maxWidth.value
            .takeIf(Float::isFinite)
            ?: NavigationRailBreakpointDp
        val layoutMode = resolveShcareAdaptiveLayoutMode(
            widthDp = availableWidthDp,
            fontScale = LocalDensity.current.fontScale,
        )
        CompositionLocalProvider(LocalShcareAdaptiveLayoutMode provides layoutMode) {
            when {
                items.size !in 3..5 -> {
                    Box(modifier = Modifier.fillMaxSize()) {
                        content(Modifier.fillMaxSize())
                    }
                }
                layoutMode == ShcareAdaptiveLayoutMode.Compact -> {
                    CompactShcareScaffold(
                        items = items,
                        selectedRoute = selectedRoute,
                        onDestinationSelected = onDestinationSelected,
                        content = content,
                    )
                }
                else -> {
                    ExpandedShcareScaffold(
                        items = items,
                        selectedRoute = selectedRoute,
                        onDestinationSelected = onDestinationSelected,
                        content = content,
                    )
                }
            }
        }
    }
}

/**
 * Reusable native list/detail surface that follows the window mode selected by [ShcareScaffold].
 *
 * When used outside the app shell (for previews and isolated screens), the component resolves the
 * same mode from its own constraints. Large text deliberately disables side-by-side content so
 * neither pane is squeezed below a readable width.
 */
@Composable
fun ShcareListDetailScaffold(
    state: ShcareListDetailState,
    modifier: Modifier = Modifier,
    listPane: @Composable (Modifier) -> Unit,
    detailPane: @Composable (Modifier, ShcareDetailPanePresentation) -> Unit,
    emptyDetailPane: @Composable (Modifier) -> Unit,
) {
    BoxWithConstraints(
        modifier = modifier
            .fillMaxSize()
            .testTag("shcare.list-detail"),
    ) {
        val inheritedMode = LocalShcareAdaptiveLayoutMode.current
        val availableWidthDp = maxWidth.value
            .takeIf(Float::isFinite)
            ?: NavigationRailBreakpointDp
        val layoutMode = inheritedMode ?: resolveShcareAdaptiveLayoutMode(
            widthDp = availableWidthDp,
            fontScale = LocalDensity.current.fontScale,
        )

        if (layoutMode == ShcareAdaptiveLayoutMode.TwoPane) {
            Row(modifier = Modifier.fillMaxSize()) {
                Box(
                    modifier = Modifier
                        .weight(0.44f)
                        .fillMaxHeight()
                        .testTag("shcare.list-detail.list"),
                ) {
                    listPane(Modifier.fillMaxSize())
                }
                VerticalDivider(
                    modifier = Modifier
                        .fillMaxHeight()
                        .testTag("shcare.list-detail.divider"),
                )
                if (state == ShcareListDetailState.NoSelection) {
                    Box(
                        modifier = Modifier
                            .weight(0.56f)
                            .fillMaxHeight()
                            .testTag("shcare.list-detail.empty-detail"),
                    ) {
                        emptyDetailPane(Modifier.fillMaxSize())
                    }
                } else {
                    Box(
                        modifier = Modifier
                            .weight(0.56f)
                            .fillMaxHeight()
                            .testTag("shcare.list-detail.detail"),
                    ) {
                        detailPane(
                            Modifier.fillMaxSize(),
                            ShcareDetailPanePresentation.SideBySide,
                        )
                    }
                }
            }
        } else if (state == ShcareListDetailState.DetailVisible) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .testTag("shcare.list-detail.single-detail"),
            ) {
                detailPane(
                    Modifier.fillMaxSize(),
                    ShcareDetailPanePresentation.FullScreen,
                )
            }
        } else {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .testTag("shcare.list-detail.list"),
            ) {
                listPane(Modifier.fillMaxSize())
            }
        }
    }
}

@Composable
private fun CompactShcareScaffold(
    items: List<ShcareNavigationItem>,
    selectedRoute: ShcareMobileRoute?,
    onDestinationSelected: (ShcarePrimaryDestination) -> Unit,
    content: @Composable (Modifier) -> Unit,
) {
    Scaffold(
        modifier = Modifier.fillMaxSize(),
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = {
            NavigationBar(
                modifier = Modifier.testTag("shcare.navigation.bottom"),
                containerColor = MaterialTheme.colorScheme.surface,
                contentColor = MaterialTheme.colorScheme.onSurface,
            ) {
                items.forEach { item ->
                    val selected = item.destination.route == selectedRoute
                    NavigationBarItem(
                        modifier = Modifier.testTag(item.testTag()),
                        selected = selected,
                        onClick = {
                            if (!selected) onDestinationSelected(item.destination)
                        },
                        icon = {
                            Icon(
                                imageVector = if (selected) item.selectedIcon else item.unselectedIcon,
                                contentDescription = null,
                            )
                        },
                        label = {
                            Text(
                                text = stringResource(item.labelRes),
                                maxLines = NavigationLabelMaxLines,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.testTag(item.labelTestTag()),
                            )
                        },
                    )
                }
            }
        },
    ) { innerPadding ->
        content(
            Modifier
                .fillMaxSize()
                .padding(innerPadding),
        )
    }
}

@Composable
private fun ExpandedShcareScaffold(
    items: List<ShcareNavigationItem>,
    selectedRoute: ShcareMobileRoute?,
    onDestinationSelected: (ShcarePrimaryDestination) -> Unit,
    content: @Composable (Modifier) -> Unit,
) {
    Row(modifier = Modifier.fillMaxSize()) {
        NavigationRail(
            modifier = Modifier
                .fillMaxHeight()
                .testTag("shcare.navigation.rail"),
            containerColor = MaterialTheme.colorScheme.surface,
            contentColor = MaterialTheme.colorScheme.onSurface,
        ) {
            items.forEach { item ->
                val selected = item.destination.route == selectedRoute
                NavigationRailItem(
                    modifier = Modifier.testTag(item.testTag()),
                    selected = selected,
                    onClick = {
                        if (!selected) onDestinationSelected(item.destination)
                    },
                    icon = {
                        Icon(
                            imageVector = if (selected) item.selectedIcon else item.unselectedIcon,
                            contentDescription = null,
                        )
                    },
                    label = {
                        Text(
                            text = stringResource(item.labelRes),
                            maxLines = NavigationLabelMaxLines,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.testTag(item.labelTestTag()),
                        )
                    },
                )
            }
        }
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxHeight(),
        ) {
            content(Modifier.fillMaxSize())
        }
    }
}

private fun ShcareNavigationItem.testTag(): String =
    "shcare.navigation.item.${destination.id.name.lowercase()}"

private fun ShcareNavigationItem.labelTestTag(): String =
    "shcare.navigation.label.${destination.id.name.lowercase()}"
