// Modify this file to run index.js locally and not as a GitHub Action.

module.exports = {
  // These parameters are required.
  GITHUB_TOKEN: null,
  GITHUB_REPO: null,  // Form of '<owner>/<repo_name>'
  LEETCODE_CSRF_TOKEN: null,
  LEETCODE_SESSION: null,

  // These parameters are optional and have default values if needed.
  FILTER_DUPLICATE_SECS: 86400,
  DESTINATION_FOLDER: null,
  VERBOSE: true,
  COMMIT_HEADER: 'Sync LeetCode submission'
}
