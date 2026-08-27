#pragma once

// Public-only Shcare release trust anchor. The matching private key is stored
// outside the repository and is injected into the backend secret manager.
static constexpr char SHCARE_PINNED_OTA_PUBLIC_KEY_PEM[] = R"SHCARE_OTA(-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAjPfBy3gmkA5YZ5kkObxG
BLgncXOUXdBEYANUS7UWwfj285BjT6rZuMQ6Dsb81M4svhXwrAm9Fyg6rFS22m8l
yF3QWtIOA1bP8XO8clqM75vpcNZUmmDlBenOHx2YF1kkLedSIfqDVoz2bdCbjATZ
eGMOuytiriELtCJ/7zYGdviHhRn0dZcwxcR6euQ6HAyKZpQXFf9lLPIz/mlvaYb/
eLGhs7LXZoz2Bnb3W6hw8Wxx7fNDk+BkHy4bwh7/THJ08rr4pRv6bibIORK6Po3u
Ou4rtXAARa2hpYkQ/26PyyrLfmQBSgC9cItrgaP+nVnl0y6GNX1/sKgAGlVcWc4p
iNZkXZYAIoX6+wiGg1MRMBbxADeDe0I2VAOCw+qswxW/w9lPhSsaiD8ZnDQGs/dp
0Klsogddb7a1ynU/8748tXCVWg1UYVpRlQjOCskEX2x0s05qDi5aYvknFs0rcXLr
+IsPpGJkM+ag88nQcAJqG0Dk/HfqDn8IqG6/1SF49amNAgMBAAE=
-----END PUBLIC KEY-----
)SHCARE_OTA";

#ifndef SMART_HEALTH_OTA_PUBLIC_KEY_PEM
#define SMART_HEALTH_OTA_PUBLIC_KEY_PEM SHCARE_PINNED_OTA_PUBLIC_KEY_PEM
#endif
