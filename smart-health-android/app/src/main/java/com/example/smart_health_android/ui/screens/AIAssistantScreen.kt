package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.smart_health_android.R
import com.example.smart_health_android.ai.AiChatLoadState
import com.example.smart_health_android.ai.AiChatUiAction
import com.example.smart_health_android.ai.AiChatUiState
import com.example.smart_health_android.ai.AiChatViewModel
import com.example.smart_health_android.data.AiChatMessage
import com.example.smart_health_android.data.formatIso
import com.example.smart_health_android.ui.components.ShcareEmptyState
import com.example.smart_health_android.ui.components.ShcareErrorState
import com.example.smart_health_android.ui.components.ShcareGradientTopAppBar
import com.example.smart_health_android.ui.components.ShcareLoadingState
import com.example.smart_health_android.ui.theme.ShcareTheme

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AIAssistantScreen(
    onNavigateBack: () -> Unit,
    viewModel: AiChatViewModel = viewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val inputEnabled = state.loadState in setOf(AiChatLoadState.Empty, AiChatLoadState.Ready)

    Scaffold(
        topBar = {
            ShcareGradientTopAppBar(
                title = stringResource(R.string.ai_assistant_title),
                onNavigateBack = onNavigateBack,
                backContentDescription = stringResource(R.string.ai_assistant_back),
            )
        },
        bottomBar = {
            if (inputEnabled) {
                AiChatInput(
                    state = state,
                    onAction = viewModel::onAction,
                )
            }
        },
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            when (state.loadState) {
                AiChatLoadState.Loading -> ShcareLoadingState(
                    modifier = Modifier.fillMaxSize(),
                )

                AiChatLoadState.Error -> AiChatLoadError(
                    requestId = state.requestId,
                    onRetry = { viewModel.onAction(AiChatUiAction.Retry) },
                )

                AiChatLoadState.Empty -> AiChatEmptyContent()

                AiChatLoadState.Unavailable -> {
                    if (state.messages.isEmpty()) {
                        ShcareEmptyState(
                            title = stringResource(R.string.ai_assistant_unavailable_title),
                            message = stringResource(R.string.ai_assistant_unavailable_message),
                            actionLabel = stringResource(R.string.shcare_action_retry),
                            onAction = { viewModel.onAction(AiChatUiAction.Retry) },
                            modifier = Modifier
                                .fillMaxSize()
                                .testTag("ai_assistant.unavailable"),
                        )
                    } else {
                        AiChatTimeline(
                            messages = state.messages,
                            providerUnavailable = true,
                        )
                    }
                }

                AiChatLoadState.Ready -> AiChatTimeline(
                    messages = state.messages,
                    providerUnavailable = false,
                )
            }
        }
    }
}

@Composable
private fun AiChatLoadError(
    requestId: String,
    onRetry: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        ShcareErrorState(
            title = stringResource(R.string.ai_assistant_load_error_title),
            message = stringResource(R.string.shcare_state_error_message),
            onRetry = onRetry,
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .testTag("ai_assistant.retry"),
        )
        if (requestId.isNotBlank()) {
            Text(
                text = stringResource(R.string.ai_assistant_request_id, requestId),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .align(Alignment.CenterHorizontally)
                    .padding(ShcareTheme.spacing.large),
            )
        }
    }
}

@Composable
private fun AiChatEmptyContent() {
    Column(
        modifier = Modifier.fillMaxSize(),
    ) {
        ShcareEmptyState(
            title = stringResource(R.string.ai_assistant_empty_title),
            message = stringResource(R.string.ai_assistant_empty_message),
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .testTag("ai_assistant.empty"),
        )
        AiDisclaimerCard(
            modifier = Modifier.padding(
                horizontal = ShcareTheme.spacing.large,
                vertical = ShcareTheme.spacing.small,
            ),
        )
    }
}

@Composable
private fun AiChatTimeline(
    messages: List<AiChatMessage>,
    providerUnavailable: Boolean,
) {
    val listState = rememberLazyListState()
    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) listState.scrollToItem(messages.lastIndex)
    }

    LazyColumn(
        state = listState,
        modifier = Modifier
            .fillMaxSize()
            .testTag("ai_assistant.timeline"),
        contentPadding = PaddingValues(ShcareTheme.spacing.large),
        verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.large),
    ) {
        if (providerUnavailable) {
            item(key = "provider-unavailable") { AiProviderUnavailableBanner() }
        }
        item(key = "disclaimer") { AiDisclaimerCard() }
        items(messages, key = { it.id }) { message ->
            AiMessageBubble(message)
        }
    }
}

@Composable
private fun AiProviderUnavailableBanner() {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = ShcareTheme.colors.warningContainer,
            contentColor = ShcareTheme.colors.onWarningContainer,
        ),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(ShcareTheme.spacing.large),
            verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.extraSmall),
        ) {
            Text(
                text = stringResource(R.string.ai_assistant_unavailable_title),
                style = MaterialTheme.typography.titleMedium,
            )
            Text(
                text = stringResource(R.string.ai_assistant_unavailable_message),
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}

@Composable
private fun AiDisclaimerCard(modifier: Modifier = Modifier) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.secondaryContainer,
            contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
        ),
        modifier = modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(ShcareTheme.spacing.large),
            horizontalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.medium),
            verticalAlignment = Alignment.Top,
        ) {
            Icon(
                imageVector = Icons.Default.Info,
                contentDescription = null,
                modifier = Modifier.size(22.dp),
            )
            Text(
                text = stringResource(R.string.ai_assistant_disclaimer),
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}

@Composable
private fun AiMessageBubble(message: AiChatMessage) {
    val isUser = message.role == "user"
    val author = if (isUser) {
        stringResource(R.string.ai_assistant_message_user)
    } else {
        stringResource(R.string.ai_assistant_message_assistant)
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start,
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(0.88f),
            horizontalAlignment = if (isUser) Alignment.End else Alignment.Start,
            verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.extraSmall),
        ) {
            Text(
                text = author,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Surface(
                shape = MaterialTheme.shapes.large,
                color = if (isUser) {
                    MaterialTheme.colorScheme.primaryContainer
                } else {
                    MaterialTheme.colorScheme.surfaceVariant
                },
                contentColor = if (isUser) {
                    MaterialTheme.colorScheme.onPrimaryContainer
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
            ) {
                Text(
                    text = message.content,
                    style = MaterialTheme.typography.bodyLarge,
                    modifier = Modifier.padding(ShcareTheme.spacing.large),
                )
            }
            Text(
                text = formatIso(message.createdAt, "HH:mm"),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun AiChatInput(
    state: AiChatUiState,
    onAction: (AiChatUiAction) -> Unit,
) {
    Surface(
        tonalElevation = 2.dp,
        modifier = Modifier
            .fillMaxWidth()
            .imePadding()
            .navigationBarsPadding()
            .testTag("ai_assistant.composer"),
    ) {
        Column(
            modifier = Modifier.padding(ShcareTheme.spacing.large),
            verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.small),
        ) {
            HorizontalDivider()
            OutlinedTextField(
                value = state.input,
                onValueChange = { onAction(AiChatUiAction.InputChanged(it)) },
                label = { Text(stringResource(R.string.ai_assistant_input_label)) },
                placeholder = { Text(stringResource(R.string.ai_assistant_input_hint)) },
                enabled = !state.isSending,
                minLines = 1,
                maxLines = 4,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = { onAction(AiChatUiAction.Send) }),
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("ai_assistant.input"),
            )
            if (state.errorMessage.isNotBlank() || state.errorMessageRes != null) {
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer,
                        contentColor = MaterialTheme.colorScheme.onErrorContainer,
                    ),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(
                        modifier = Modifier.padding(ShcareTheme.spacing.medium),
                        verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.extraSmall),
                    ) {
                        Text(
                            text = stringResource(R.string.ai_assistant_send_error),
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        if (state.requestId.isNotBlank()) {
                            Text(
                                text = stringResource(R.string.ai_assistant_request_id, state.requestId),
                                style = MaterialTheme.typography.labelSmall,
                            )
                        }
                    }
                }
            }
            Button(
                onClick = { onAction(AiChatUiAction.Send) },
                enabled = state.input.isNotBlank() && !state.isSending,
                modifier = Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = 48.dp)
                    .testTag("ai_assistant.send"),
            ) {
                if (state.isSending) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        strokeWidth = 2.dp,
                    )
                    Spacer(Modifier.size(ShcareTheme.spacing.small))
                    Text(stringResource(R.string.ai_assistant_sending))
                } else {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.Send,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(Modifier.size(ShcareTheme.spacing.small))
                    Text(stringResource(R.string.ai_assistant_send))
                }
            }
        }
    }
}
