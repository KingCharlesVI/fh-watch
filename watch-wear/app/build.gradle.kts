plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
}

android {
    namespace = "com.fhmatchcentre.watch"
    compileSdk = 37

    defaultConfig {
        // The same as the phone app's: the Wearable Data Layer only connects apps
        // with the same package name and signing key.
        applicationId = "com.fhmatchcentre.app"
        minSdk = 30
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }

    signingConfigs {
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
