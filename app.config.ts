export default {
  expo: {
    name: "domoweobowiazki",
    slug: "domoweobowiazki",
    version: "1.0.0",

    platforms: ["ios", "android", "web"],

    experiments: {
      typedRoutes: true,
    },

    android: {
      package: "com.anonymous.domoweobowiazki",
    },

    extra: {
      eas: {
        projectId: "27da060e-156b-4fb8-8a5f-c2120da7d68e",
      },
    },

    web: {
      bundler: "metro",
      output: "static",
      favicon: "./assets/favicon.png",
    },
  },
};
