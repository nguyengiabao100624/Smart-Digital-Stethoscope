plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.google.services)
}

val requestedTasks = gradle.startParameter.taskNames.joinToString(" ").lowercase()
val releaseBuildRequested = requestedTasks.contains("release")
val smartHealthBaseUrl = providers
    .gradleProperty("SMART_HEALTH_BASE_URL")
    .orElse(if (releaseBuildRequested) "" else "https://smart-health-api-r5is.onrender.com")
    .get()
    .trimEnd('/')
val phoneAuthEnabled = providers
    .gradleProperty("SMART_HEALTH_PHONE_AUTH_ENABLED")
    .orElse("false")
    .get()
    .toBooleanStrictOrNull()
    ?: false

if (releaseBuildRequested) {
    require(smartHealthBaseUrl.isNotBlank()) {
        "SMART_HEALTH_BASE_URL is required for release builds, for example: " +
            "./gradlew assembleRelease -PSMART_HEALTH_BASE_URL=https://api.smart-health.example.com"
    }
    require(smartHealthBaseUrl.startsWith("https://")) {
        "Release builds must use an HTTPS backend URL. Current SMART_HEALTH_BASE_URL=$smartHealthBaseUrl"
    }

    val localBackendHosts = listOf("10.0.2.2", "127.0.0.1", "localhost", "0.0.0.0")
    require(localBackendHosts.none { smartHealthBaseUrl.contains(it, ignoreCase = true) }) {
        "Release builds must not point to a local or emulator backend URL. " +
            "Current SMART_HEALTH_BASE_URL=$smartHealthBaseUrl"
    }
}

android {
    namespace = "com.example.smart_health_android"
    compileSdk {
        version = release(36)
    }

    defaultConfig {
        applicationId = "com.example.smart_health_android"
        minSdk = 27
        targetSdk = 36
        versionCode = 2
        versionName = "1.0.0-rc.1"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "SMART_HEALTH_BASE_URL", "\"$smartHealthBaseUrl\"")
        buildConfigField("boolean", "SMART_HEALTH_PHONE_AUTH_ENABLED", phoneAuthEnabled.toString())
        manifestPlaceholders["usesCleartextTraffic"] = "false"
    }

    buildTypes {
        debug {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
        }
        release {
            isMinifyEnabled = false
            manifestPlaceholders["usesCleartextTraffic"] = "false"
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.10.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.10.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.10.0")
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(platform(libs.firebase.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation("androidx.navigation:navigation-compose:2.7.7")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation(libs.firebase.auth)
    implementation(libs.firebase.messaging)
    implementation("com.google.android.gms:play-services-code-scanner:16.1.0")
    testImplementation(libs.junit)
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
    testImplementation("org.json:json:20240303")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.2")
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}
