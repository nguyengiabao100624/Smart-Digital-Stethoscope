plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.google.services)
}

val requestedTasks = gradle.startParameter.taskNames.joinToString(" ").lowercase()
val releaseBuildRequested = requestedTasks.contains("release")
val smartHealthBaseUrl = providers
    .gradleProperty("SMART_HEALTH_BASE_URL")
    .orElse(if (releaseBuildRequested) "" else "https://smart-health-api-xj0a.onrender.com")
    .get()
    .trimEnd('/')

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
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "SMART_HEALTH_BASE_URL", "\"$smartHealthBaseUrl\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
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
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}
