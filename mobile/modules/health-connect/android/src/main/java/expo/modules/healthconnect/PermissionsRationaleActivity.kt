package expo.modules.healthconnect

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle

/** Opens the privacy policy, which says what the app does with health data, when Health Connect asks why. */
class PermissionsRationaleActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(PRIVACY_URL))) }
    finish()
  }

  companion object {
    const val PRIVACY_URL = "https://fhmatchcentre.com/privacy"
  }
}
