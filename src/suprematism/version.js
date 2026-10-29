// The generator is deterministic: a seed and a canvas size always give the same
// composition, and that is what lets a link bring a picture back. It holds only
// while the generator is unchanged. Whenever a change makes it produce something
// different for the same seed (a law, a parameter, a new kind of form, even a
// reordered random draw), raise this number. Every link carries it, so a link
// made by another version can say that its picture may differ.
//
// generator.version.test.js fails when the output changes, and says what to do.
export const GENERATOR_VERSION = 1
