function setBaseGlobals() {
  global.window = { addEventListener() {}, navigator: {} };
  global.document = { addEventListener() {}, getElementById: () => null };
}

module.exports = { setBaseGlobals };
