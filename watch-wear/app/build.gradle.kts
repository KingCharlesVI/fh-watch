import groovy.json.JsonSlurper

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
}

/** The release number shared with the phone app (version.json at the repository root). */
@Suppress("UNCHECKED_CAST")
val release = JsonSlurper().parse(rootProject.file("../version.json")) as Map<String, Any>

/** The upload key, from Gradle properties outside the repository; see mobile/plugins/with-release-signing.js. */
val uploadKey = providers.gradleProperty("FH_UPLOAD_STORE_FILE").orNull

android {
    namespace = "com.fhmatchcentre.watch"
    compileSdk = 37

    defaultConfig {
        // The same as the phone app's: the Wearable Data Layer only connects apps
        // with the same package name and signing key.
        applicationId = "com.fhmatchcentre.app"
        minSdk = 30
        targetSdk = 36
        // 1,000,000 above the phone app's: they share one Play listing, and version codes must be unique in it.
        versionCode = 1_000_000 + (release["build"] as Number).toInt()
        versionName = release["version"] as String
    }

    signingConfigs {
        if (uploadKey != null) {
            create("release") {
                storeFile = file(uploadKey)
                storePassword = providers.gradleProperty("FH_UPLOAD_STORE_PASSWORD").get()
                keyAlias = providers.gradleProperty("FH_UPLOAD_KEY_ALIAS").get()
                keyPassword = providers.gradleProperty("FH_UPLOAD_KEY_PASSWORD").get()
            }
        }
        getByName("debug") {
            // React Native's public debug key, which the phone app's debug build also uses.
            storeFile = file("debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildTypes {
        release {
            // Without the upload key, the debug key: fine for trying a release build, refused by Google Play.
            signingConfig = signingConfigs.getByName(if (uploadKey != null) "release" else "debug")
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    buildFeatures {
        compose = true
    }

    testOptions {
        unitTests.all {
            // The match contract the watch must produce, generated from the shared Zod schema.
            it.systemProperty("matchSchema", rootProject.file("../schema/match.schema.json").absolutePath)
        }
    }
}

kotlin {
    jvmToolchain(21)
}

ksp {
    arg("room.schemaLocation", "$projectDir/schemas")
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.fragment)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.service)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.tooling.preview)
    debugImplementation(libs.compose.ui.tooling)
    implementation(libs.wear.compose.material3)
    implementation(libs.wear.compose.foundation)
    implementation(libs.wear.compose.navigation)
    implementation(libs.wear.ongoing)
    implementation(libs.wear)
    implementation(libs.wear.input)
    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    ksp(libs.room.compiler)
    implementation(libs.play.services.wearable)
    implementation(libs.coroutines.android)
    implementation(libs.coroutines.play.services)
    implementation(libs.serialization.json)

    testImplementation(libs.junit)
    testImplementation(libs.json.schema.validator)
}
