// The Android code's package is com.bitevo.app ("in" is a reserved word in Kotlin), while the app's ID on
// phones and the Play Store stays in.bitevo.app (android/app/build.gradle). Auto-linking needs the former.
module.exports = {
  project: {
    android: { packageName: 'com.bitevo.app' },
  },
};
