// The wordmark. Each entry is one rendered row; left holds the first word and
// right the second, drawn in the muted and bright colours respectively. The
// renderer maps "_" to a gap, "^" and "~" to an upper half block, and "," to a
// lower half block, which is how a four-row grid produces the taller letters.
export const logo = {
  left: [
    " ██████  ██████  ███████ ███    ██",
    "██    ██ ██   ██ ██      ████   ██",
    "██    ██ ██████  █████   ██ ██  ██",
    "██    ██ ██      ██      ██  ██ ██",
    " ██████  ██      ███████ ██   ████",
  ],
  right: [
    "███    ███  ██████  ██████  ",
    "████  ████ ██    ██ ██   ██ ",
    "██ ████ ██ ██    ██ ██   ██ ",
    "██  ██  ██ ██    ██ ██   ██ ",
    "██      ██  ██████  ██████  ",
  ],
}

export const go = {
  left: ["    ", "█▀▀▀", "█_^█", "▀▀▀▀"],
  right: ["    ", "█▀▀█", "█__█", "▀▀▀▀"],
}
