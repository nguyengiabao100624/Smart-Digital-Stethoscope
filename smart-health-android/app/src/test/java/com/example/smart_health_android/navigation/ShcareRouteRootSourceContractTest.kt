package com.example.smart_health_android.navigation

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ShcareRouteRootSourceContractTest {
    @Test
    fun everyTypedRouteHasOneUniqueCanonicalRootTestTag() {
        val tags = ShcareMobileRoute.entries.map(ShcareMobileRoute::testTag)

        assertEquals(tags.size, tags.distinct().size)
        assertTrue(tags.all { it.startsWith("route.") })
        assertTrue(tags.none(String::isBlank))
        assertEquals(
            ShcareMobileRoute.PatientDashboard.testTag,
            ShcareMobileRouteContract.rootTestTagFor("patient-dashboard"),
        )
        assertEquals(
            ShcareMobileRoute.RecordDetail.testTag,
            ShcareMobileRouteContract.rootTestTagFor(
                ShcareMobileRoute.RecordDetail.routePattern,
            ),
        )
        assertEquals(
            ShcareMobileRouteContract.UnknownRouteTestTag,
            ShcareMobileRouteContract.rootTestTagFor("platform-admin/users"),
        )
    }

    @Test
    fun appNavGraphBindsTheActiveTypedRouteTagAndNeverNavigatesARawExternalUri() {
        assertTrue(
            appNavGraphSource.contains(
                ".shcareRouteRootTestTag(activeRouteForSemantics)",
            ),
        )
        assertTrue(
            appNavGraphSource.contains(
                "ShcareExternalDeepLinkContract.evaluate(",
            ),
        )
        assertTrue(
            appNavGraphSource.contains(
                "navController.navigate(decision.destinationRoute)",
            ),
        )
        assertFalse(appNavGraphSource.contains("navController.navigate(request.rawUri)"))
        assertFalse(appNavGraphSource.contains("navController.navigate(externalDeepLink"))
    }

    @Test
    fun exportedActivityAcceptsOnlyTheTwoCanonicalExternalOrigins() {
        assertTrue(manifestSource.contains("android:scheme=\"shcare\""))
        assertTrue(manifestSource.contains("android:host=\"app\""))
        assertTrue(manifestSource.contains("android:scheme=\"https\""))
        assertTrue(manifestSource.contains("android:host=\"shcare.web.app\""))
        assertTrue(manifestSource.contains("android:pathPrefix=\"/app/\""))
        assertTrue(mainActivitySource.contains("ShcareExternalDeepLinkContract.bind("))
        assertTrue(mainActivitySource.contains("onExternalDeepLinkLaunchRequestConsumed"))
    }

    private val appNavGraphSource = projectFile(
        "src/main/java/com/example/smart_health_android/navigation/AppNavGraph.kt",
    ).readText()
    private val mainActivitySource = projectFile(
        "src/main/java/com/example/smart_health_android/MainActivity.kt",
    ).readText()
    private val manifestSource = projectFile("src/main/AndroidManifest.xml").readText()

    private fun projectFile(relativePath: String): File {
        val workingDirectory = File(requireNotNull(System.getProperty("user.dir")))
        return sequenceOf(
            workingDirectory.resolve(relativePath),
            workingDirectory.resolve("app").resolve(relativePath),
        ).firstOrNull(File::isFile)
            ?: error("Cannot locate $relativePath from ${workingDirectory.absolutePath}")
    }
}
