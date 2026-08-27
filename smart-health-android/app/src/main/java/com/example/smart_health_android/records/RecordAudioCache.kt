package com.example.smart_health_android.records

import android.content.Context
import java.io.File
import java.util.UUID

data class RecordAudioCacheSummary(
    val fileCount: Int,
    val byteCount: Long,
)

object RecordAudioCache {
    private const val DIRECTORY_NAME = "record-audio"
    private const val MAX_FILES = 8
    private const val MAX_AGE_MILLIS = 24L * 60L * 60L * 1_000L

    @Volatile
    private var rootDirectory: File? = null

    @Synchronized
    fun initialize(context: Context) {
        rootDirectory = File(context.applicationContext.cacheDir, DIRECTORY_NAME)
        purge()
    }

    @Synchronized
    fun createDestination(): File {
        val root = requireNotNull(rootDirectory) {
            "RecordAudioCache must be initialized before use"
        }
        if (!root.exists() && !root.mkdirs()) {
            error("Cannot create private record audio cache")
        }
        purge()
        return File(root, "record-${UUID.randomUUID()}.wav")
    }

    @Synchronized
    fun purge(nowMillis: Long = System.currentTimeMillis()) {
        val root = rootDirectory ?: return
        if (!root.exists()) return
        val files = root.listFiles()
            .orEmpty()
            .filter(File::isFile)
            .sortedByDescending(File::lastModified)
        files.forEachIndexed { index, file ->
            val expired = nowMillis - file.lastModified() > MAX_AGE_MILLIS
            if (expired || index >= MAX_FILES) {
                file.delete()
            }
        }
    }

    @Synchronized
    fun clear(): RecordAudioCacheSummary {
        val root = rootDirectory ?: return RecordAudioCacheSummary(
            fileCount = 0,
            byteCount = 0L,
        )
        root.listFiles()
            .orEmpty()
            .filter(File::isFile)
            .forEach(File::delete)
        return summary()
    }

    @Synchronized
    fun summary(): RecordAudioCacheSummary {
        val files = rootDirectory
            ?.listFiles()
            .orEmpty()
            .filter(File::isFile)
        return RecordAudioCacheSummary(
            fileCount = files.size,
            byteCount = files.sumOf(File::length),
        )
    }
}
