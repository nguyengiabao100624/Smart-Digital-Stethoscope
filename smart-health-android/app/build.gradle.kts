plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

val requestedTasks = gradle.startParameter.taskNames.joinToString(" ").lowercase()
val releaseBuildRequested = requestedTasks.contains("release")
val googleServicesConfigured =
    file("google-services.json").isFile ||
        fileTree("src") {
            include("**/google-services.json")
        }.files.isNotEmpty()
val releaseGoogleServicesConfigured =
    file("google-services.json").isFile ||
        file("src/release/google-services.json").isFile
val configuredSmartHealthBaseUrl = providers
    .gradleProperty("SMART_HEALTH_BASE_URL")
    .map { it.trim().trimEnd('/') }

if (googleServicesConfigured) {
    pluginManager.apply("com.google.gms.google-services")
} else {
    logger.warn(
        "google-services.json is absent: building a source-verification debug artifact " +
            "without Firebase runtime configuration.",
    )
}

val smartHealthBaseUrl = configuredSmartHealthBaseUrl
    .orElse(if (releaseBuildRequested) "" else "https://smart-health-api-r5is.onrender.com")
    .get()
    .trimEnd('/')
fun validateReleaseConfiguration() {
    require(releaseGoogleServicesConfigured) {
        "google-services.json is required for release builds. " +
            "Provide it through the secure release environment; never commit it."
    }

    val releaseBaseUrl = configuredSmartHealthBaseUrl.orNull.orEmpty()
    require(releaseBaseUrl.isNotBlank()) {
        "SMART_HEALTH_BASE_URL is required for release builds, for example: " +
            "./gradlew assembleRelease -PSMART_HEALTH_BASE_URL=https://api.smart-health.example.com"
    }
    require(releaseBaseUrl.startsWith("https://")) {
        "Release builds must use an HTTPS backend URL. Current SMART_HEALTH_BASE_URL=$releaseBaseUrl"
    }

    val localBackendHosts = listOf("10.0.2.2", "127.0.0.1", "localhost", "0.0.0.0")
    require(localBackendHosts.none { releaseBaseUrl.contains(it, ignoreCase = true) }) {
        "Release builds must not point to a local or emulator backend URL. " +
            "Current SMART_HEALTH_BASE_URL=$releaseBaseUrl"
    }
}

if (releaseBuildRequested) {
    validateReleaseConfiguration()
}

gradle.taskGraph.whenReady {
    if (allTasks.any { it.path == "${project.path}:preReleaseBuild" }) {
        validateReleaseConfiguration()
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
        versionCode = 3
        versionName = "1.0.0-rc.2"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "SMART_HEALTH_BASE_URL", "\"$smartHealthBaseUrl\"")
        buildConfigField("boolean", "SHCARE_FIREBASE_CONFIGURED", googleServicesConfigured.toString())
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
    lint {
        lintConfig = rootProject.file("lint.xml")
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.biometric)
    implementation(libs.androidx.fragment)
    implementation(platform(libs.androidx.compose.bom))
    implementation(platform(libs.firebase.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.squareup.okhttp)
    implementation(libs.firebase.auth)
    implementation(libs.firebase.messaging)
    implementation(libs.google.play.services.code.scanner)
    testImplementation(libs.junit)
    testImplementation(libs.squareup.mockwebserver)
    testImplementation(libs.json)
    testImplementation(libs.kotlinx.coroutines.test)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}
