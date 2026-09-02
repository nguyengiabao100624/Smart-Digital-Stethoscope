package com.example.smart_health_android.devices

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DeviceAccessCodeContractTest {
    @Test
    fun manualCodeIsNormalizedWithoutChangingItsIdentity() {
        assertEquals(
            "SHC-ABCD-EFGH-JKLM-NPQR",
            parseDeviceAccessCode(" shc abcd efgh jklm npqr "),
        )
    }

    @Test
    fun canonicalQrPayloadReturnsOnlyTheAccessCode() {
        assertEquals(
            "SHC-ABCD-EFGH-JKLM-NPQR",
            parseDeviceAccessCode(
                "shcare://device-access?v=1&code=SHC-ABCD-EFGH-JKLM-NPQR",
            ),
        )
    }

    @Test
    fun legacyDeviceIdentityAndUnexpectedQrFieldsFailClosed() {
        assertNull(parseDeviceAccessCode("shcare-g3-prod-demo"))
        assertNull(parseDeviceAccessCode("shcare://device-access?v=2&code=SHC-ABCD-EFGH-JKLM-NPQR"))
        assertNull(parseDeviceAccessCode("shcare://device-access?v=1&code=SHC-ABCD-EFGH-JKLM-NPQR&deviceId=dev-1"))
        assertNull(parseDeviceAccessCode("https://example.com/device-access?v=1&code=SHC-ABCD-EFGH-JKLM-NPQR"))
    }
}
