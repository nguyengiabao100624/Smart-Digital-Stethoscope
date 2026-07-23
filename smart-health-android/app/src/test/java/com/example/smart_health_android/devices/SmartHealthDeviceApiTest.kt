package com.example.smart_health_android.devices

import com.example.smart_health_android.data.SmartHealthApi
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.DevicePairingOutcome
import com.example.smart_health_android.data.DevicePairingPresence
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.assertThrows
import org.junit.Before
import org.junit.Test

class SmartHealthDeviceApiTest {
    private lateinit var server: MockWebServer
    private lateinit var api: SmartHealthApi

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = SmartHealthApi(baseUrl = server.url("/api/v1").toString().trimEnd('/'))
        api.setAuthToken("firebase-id-token")
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun connectedWithoutCanonicalOnlineRemainsOffline() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """
                    {
                      "devices": [
                        {"id": "dev-001", "connected": true}
                      ]
                    }
                    """.trimIndent(),
                ),
        )

        val device = api.listDevices().single()

        assertFalse(device.online)
    }

    @Test
    fun pairDeviceSendsAuthenticatedClaimAndStableIdempotencyKey() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """
                    {
                      "device": {
                        "id": "Device_Aa-01",
                        "name": "Shcare 001",
                        "online": false
                      },
                      "pairing": {
                        "outcome": "accepted",
                        "presence": "awaiting_online",
                        "onlineConfirmed": false,
                        "authenticatedTransport": null
                      }
                    }
                    """.trimIndent(),
                ),
        )

        val response = api.pairDevice(
            deviceId = "Device_Aa-01",
            claimCode = "Claim_aB-123",
            connectionMethod = "Manual",
            idempotencyKey = "pair-key-1",
        )
        val request = server.takeRequest()
        val body = JSONObject(request.body.readUtf8())

        assertEquals("Device_Aa-01", response.device.id)
        assertEquals(DevicePairingOutcome.Accepted, response.pairing.outcome)
        assertEquals(DevicePairingPresence.AwaitingOnline, response.pairing.presence)
        assertFalse(response.pairing.onlineConfirmed)
        assertEquals("POST", request.method)
        assertEquals("/api/v1/devices/pair", request.path)
        assertEquals("Bearer firebase-id-token", request.getHeader("Authorization"))
        assertEquals("pair-key-1", request.getHeader("Idempotency-Key"))
        assertEquals("Device_Aa-01", body.getString("deviceId"))
        assertEquals("Claim_aB-123", body.getString("claimCode"))
        assertEquals("Manual", body.getString("connectionMethod"))
    }

    @Test
    fun pairDeviceReturnsBackendConfirmedOnlineState() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """
                    {
                      "device": {
                        "id": "Device_Aa-01",
                        "name": "Shcare 001",
                        "connected": true,
                        "online": true
                      },
                      "pairing": {
                        "outcome": "success",
                        "presence": "online",
                        "onlineConfirmed": true,
                        "authenticatedTransport": "wss"
                      },
                      "idempotent": true
                    }
                    """.trimIndent(),
                ),
        )

        val response = api.pairDevice(
            deviceId = "Device_Aa-01",
            claimCode = "Claim_aB-123",
            connectionMethod = "QR",
            idempotencyKey = "pair-key-2",
        )

        assertEquals(DevicePairingOutcome.Success, response.pairing.outcome)
        assertEquals(DevicePairingPresence.Online, response.pairing.presence)
        assertTrue(response.pairing.onlineConfirmed)
        assertEquals("wss", response.pairing.authenticatedTransport)
        assertTrue(response.device.online)
        assertTrue(response.idempotent)
    }

    @Test
    fun pairDeviceRejectsMismatchedDeviceIdentity() {
        assertPairingContractFailure(
            """
            {
              "device": {"id": "Device_Aa-02", "online": false},
              "pairing": {
                "outcome": "accepted",
                "presence": "awaiting_online",
                "onlineConfirmed": false,
                "authenticatedTransport": null
              }
            }
            """.trimIndent(),
        )
    }

    @Test
    fun pairDeviceRejectsOutcomePresenceDrift() {
        assertPairingContractFailure(
            """
            {
              "device": {"id": "Device_Aa-01", "online": false},
              "pairing": {
                "outcome": "accepted",
                "presence": "online",
                "onlineConfirmed": false,
                "authenticatedTransport": null
              }
            }
            """.trimIndent(),
        )
    }

    @Test
    fun pairDeviceRejectsMalformedConfirmation() {
        assertPairingContractFailure(
            """
            {
              "device": {"id": "Device_Aa-01", "online": false},
              "pairing": {
                "outcome": "accepted",
                "presence": "awaiting_online",
                "authenticatedTransport": null
              }
            }
            """.trimIndent(),
        )
    }

    @Test
    fun pairDeviceRejectsOnlineConfirmationWhenDeviceIsNotAuthenticatedOnline() {
        assertPairingContractFailure(
            """
            {
              "device": {
                "id": "Device_Aa-01",
                "connected": false,
                "online": false
              },
              "pairing": {
                "outcome": "success",
                "presence": "online",
                "onlineConfirmed": true,
                "authenticatedTransport": "wss"
              }
            }
            """.trimIndent(),
        )
    }

    private fun assertPairingContractFailure(body: String) {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(body),
        )

        val error = assertThrows(SmartHealthApiException::class.java) {
            runBlocking {
                api.pairDevice(
                    deviceId = "Device_Aa-01",
                    claimCode = "Claim_aB-123",
                    connectionMethod = "QR",
                    idempotencyKey = "pair-key-negative",
                )
            }
        }

        assertEquals(502, error.statusCode)
        assertEquals("DEVICE_PAIRING_CONTRACT_INVALID", error.code)
    }
}
