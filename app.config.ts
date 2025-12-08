export default {
  name: "domoweobowiazki",
  slug: "domoweobowiazki",
  scheme: "domoweobowiazki",
  version: "1.0.0",

  platforms: ["ios", "android", "web"],

  experiments: {
    typedRoutes: true
  },

  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/favicon.png"
  }
};
