const action = require('./action');
const core = require('@actions/core');

async function main() {
  const githubToken = core.getInput('github-token');
  const owner = context.repo.owner;
  const repo = context.repo.repo;
  const leetcodeCSRFToken = core.getInput('leetcode-csrf-token');
  const leetcodeSession = core.getInput('leetcode-session');
  const filterDuplicateSecs = core.getInput('filter-duplicate-secs');
  const destinationFolder = core.getInput('destination-folder');

  await action.sync({ githubToken, owner, repo, filterDuplicateSecs, leetcodeCSRFToken, leetcodeSession, destinationFolder });
}

main().catch((error) => {
  action.log(error.stack);
  core.setFailed(error);
});
