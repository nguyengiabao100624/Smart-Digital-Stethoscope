package com.example.smart_health_android

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LintPolicySourceContractTest {
    private val projectRoot = locateProjectRoot()
    private val lintPolicy = projectRoot.resolve("lint.xml").readText()
    private val appBuild = projectRoot.resolve("app/build.gradle.kts").readText()

    @Test
    fun lintPolicySuppressesOnlyPinnedVersionRecommendations() {
        val issueIds = Regex("<issue id=\"([^\"]+)\">")
            .findAll(lintPolicy)
            .map { match -> match.groupValues[1] }
            .toSet()

        assertEquals(
            setOf(
                "AndroidGradlePluginVersion",
                "GradleDependency",
                "NewerVersionAvailable",
                "OldTargetApi",
            ),
            issueIds,
        )
        assertTrue(lintPolicy.contains("gradle/libs.versions.toml"))
        assertTrue(lintPolicy.contains("gradle/wrapper/gradle-wrapper.properties"))
        assertTrue(lintPolicy.contains("app/build.gradle.kts"))
        assertFalse(lintPolicy.contains("<baseline", ignoreCase = true))
        assertFalse(appBuild.contains("baseline", ignoreCase = true))
        assertFalse(lintPolicy.contains("warningsAsErrors", ignoreCase = true))
        assertFalse(lintPolicy.contains("<issue id=\"all\"", ignoreCase = true))
        assertTrue(appBuild.contains("lintConfig = rootProject.file(\"lint.xml\")"))
    }

    private fun locateProjectRoot(): File {
        val workingDirectory = File(requireNotNull(System.getProperty("user.dir")))
        return generateSequence(workingDirectory) { directory -> directory.parentFile }
            .firstOrNull { directory ->
                directory.resolve("app/build.gradle.kts").isFile &&
                    directory.resolve("gradle/libs.versions.toml").isFile
            }
            ?: error("Cannot locate Android project root from ${workingDirectory.absolutePath}")
    }
}
