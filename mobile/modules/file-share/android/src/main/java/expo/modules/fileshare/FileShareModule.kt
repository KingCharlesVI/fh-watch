package expo.modules.fileshare

import android.content.ClipData
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Shares a file through Android's share sheet (WhatsApp, email, Quick Share and so on) with a
 * subject and a message, which expo-sharing can't add: email apps use the subject, and
 * WhatsApp sends the message as the file's caption.
 */
class FileShareModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FileShare")

    AsyncFunction("shareFile") { fileUri: String, mimeType: String, subject: String, text: String, title: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val file = File(requireNotNull(Uri.parse(fileUri).path) { "Not a file: $fileUri" })
      // expo-sharing's provider, which already covers the app's cache.
      val content = FileProvider.getUriForFile(context, "${context.packageName}.SharingFileProvider", file)
      val send = Intent(Intent.ACTION_SEND).apply {
        type = mimeType
        putExtra(Intent.EXTRA_STREAM, content)
        putExtra(Intent.EXTRA_SUBJECT, subject)
        putExtra(Intent.EXTRA_TEXT, text)
        // The clip carries the read permission through the share sheet to the chosen app.
        clipData = ClipData.newRawUri(null, content)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      appContext.throwingActivity.startActivity(Intent.createChooser(send, title))
    }
  }
}
