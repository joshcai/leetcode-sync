require("dotenv").config();
// Modify this file to run index.js locally and not as a GitHub Action.

module.exports = {
  // These parameters are required.
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  GITHUB_REPO: process.env.GITHUB_REPO, // Form of '<owner>/<repo_name>'
  LEETCODE_CSRF_TOKEN: process.env.LEETCODE_CSRF_TOKEN,
  LEETCODE_SESSION: process.env.LEETCODE_SESSION,

  // These parameters are optional and have default values if needed.
  FILTER_DUPLICATE_SECS: process.env.FILTER_DUPLICATE_SECS ?? 86400,
  DESTINATION_FOLDER: process.env.DESTINATION_FOLDER ?? "",
  VERBOSE: process.env.VERBOSE ?? true,
  COMMIT_HEADER: process.env.COMMIT_HEADER ?? "Sync LeetCode submission",
};
