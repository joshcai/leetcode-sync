// Modify this file to run index.js locally and not as a GitHub Action.

module.exports = {
  GITHUB_TOKEN: null,
  // Form of "<owner>/<repo_name>"
  GITHUB_REPO: null,
  
  LEETCODE_CSRF_TOKEN: null,
  LEETCODE_SESSION: null,

  // These parameters are optional and have default values.
  FILTER_DUPLICATE_SECS: 86400,
  DESTINATION_FOLDER: null,
}