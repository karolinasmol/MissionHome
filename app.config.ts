export default {
  expo: {
    name: "domoweobowiazki",
    slug: "domoweobowiazki",
    scheme: "domoweobowiazki",
    platforms: ["ios", "android", "web"],

    web: {
      bundler: "metro",      // <-- TO JEST KLUCZOWE!!!
      output: "static"       // <-- konieczne dla expo export
    },

    experiments: {
      typedRoutes: true      // dla expo-router 6.x
    }
  }
};
