const axios = require('axios');
const core = require('@actions/core');
const github = require('@actions/github');
const { Octokit } = require('@octokit/rest');

const COMMIT_MESSAGE = 'Sync LeetCode submission';
const LANG_TO_EXTENSION = {
  'bash': 'sh',
  'c': 'c',
  'cpp': 'cpp',
  'csharp': 'cs',
  'golang': 'go',
  'java': 'java',
  'javascript': 'js',
  'kotlin': 'kt',
  'mysql': 'sql',
  'php': 'php',
  'python': 'py',
  'python3': 'py',
  'ruby': 'rb',
  'rust': 'rs',
  'scala': 'scala',
  'swift': 'swift',
};

const delay = ms => new Promise(res => setTimeout(res, ms));

function normalizeName(problemName) {
  return problemName.toLowerCase().replace(/\s/g, '_');
}

async function commit(octokit, owner, repo, commitInfo, treeSHA, latestCommitSHA, submission) {
  const name = normalizeName(submission.title);
  console.log(`Committing solution for ${name}...`);

  if (!LANG_TO_EXTENSION[submission.lang]) {
    throw `Language ${submission.lang} does not have a registered extension.`;
  }

  const treeData = [
    {
      path: `problems/${name}/solution.${LANG_TO_EXTENSION[submission.lang]}`,
      mode: '100644',
      content: submission.code,
    }
  ];
  
  const treeResponse = await octokit.git.createTree({
    owner: owner,
    repo: repo,
    base_tree: treeSHA,
    tree: treeData,
  })

  const date = new Date(submission.timestamp * 1000).toISOString();
  const commitResponse = await octokit.git.createCommit({
    owner: owner,
    repo: repo,
    message: `${COMMIT_MESSAGE} - ${submission.title} (${submission.lang})`,
    tree: treeResponse.data.sha,
    parents: [latestCommitSHA],
    author: {
      email: commitInfo.email,
      name: commitInfo.name,
      date: date,
    },
    committer: {
      email: commitInfo.email,
      name: commitInfo.name,
      date: date,
    },
  })

  await octokit.git.updateRef({
    owner: owner,
    repo: repo,
    sha: commitResponse.data.sha,
    ref: 'heads/master',
    force: true
  });

  console.log(`Committed solution for ${name}`);

  return [treeResponse.data.sha, commitResponse.data.sha];
}

// Returns false if no more submissions should be added.
function addToSubmissions(response, lastTimestamp, filterDuplicateSecs, submissions_dict, submissions) {
    for (const submission of response.data.submissions_dump) {
      if (submission.timestamp < lastTimestamp) {
        return false;
      }
      if (submission.status_display !== 'Accepted') {
        continue;
      }
      const name = normalizeName(submission.title);
      const lang = submission.lang;
      if (!submissions_dict[name]) {
        submissions_dict[name] = {};
      }
      // Filter out other accepted solutions less than one day from the most recent one.
      if (submissions_dict[name][lang] && submissions_dict[name][lang] - submission.timestamp < filterDuplicateSecs) {
        continue;
      }
      submissions_dict[name][lang] = submission.timestamp;
      submissions.push(submission);
    }
  return true;
}

async function sync(githubToken, owner, repo, filterDuplicateSecs, leetcodeCSRFToken, leetcodeSession) {
  const octokit = new Octokit({
    auth: githubToken,
    userAgent: 'LeetCode sync to GitHub - GitHub Action',
  });
  // First, get the time the timestamp for when the syncer last ran.
  const commits = await octokit.repos.listCommits({
    owner: owner,
    repo: repo,
    per_page: 100,
  });

  let lastTimestamp = 0;
  // commitInfo is used to get the original name / email to use for the author / committer. 
  // Since we need to modify the commit time, we can't use the default settings for the
  // authenticated user.
  let commitInfo = commits.data[commits.data.length-1].commit.author;
  for (const commit of commits.data) {
    if (!commit.commit.message.startsWith(COMMIT_MESSAGE)) {
      continue
    }
    commitInfo = commit.commit.author;
    lastTimestamp = Date.parse(commit.commit.committer.date) / 1000;
    break;
  }

  // Get all Accepted submissions from LeetCode greater than the timestamp.
  let response = null;
  let offset = 0;
  const submissions = [];
  const submissions_dict = {};
  do {
    const config = {
      params: {
        offset: offset,
        limit: 20,
        lastkey: (response === null ? '' : response.data.last_key),
      },
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRFToken': leetcodeCSRFToken,
        'Cookie':  `csrftoken=${leetcodeCSRFToken};LEETCODE_SESSION=${leetcodeSession};`,
      },
    };
    console.log(`Getting submission from LeetCode, offset ${offset}`);
    response = await axios.get('https://leetcode.com/api/submissions/', config);
    offset += 20;

    if (!addToSubmissions(response, lastTimestamp, filterDuplicateSecs, submissions_dict, submissions)) {
      break;
    }

    // There's a rate limit on LeetCode API, so wait 1 second before trying to fetch the next page. 
    await delay(1000);
  } while (response.data.has_next);

  // We have all submissions we want to write to GitHub now.
  // Write in reverse order (oldest first), so that if there's errors, the last sync time
  // is still valid.
  console.log(`Syncing ${submissions.length} submissions...`);
  let latestCommitSHA = commits.data[0].sha;
  let treeSHA = commits.data[0].commit.tree.sha;
  for (i = submissions.length - 1; i >= 0; i--) {
    submission = submissions[i];
    [treeSHA, latestCommitSHA] = await commit(octokit, owner, repo, commitInfo, treeSHA, latestCommitSHA, submission);
  }
  console.log('Done syncing all submissions.');
}

async function main() {
  const githubToken = github.token;
  const [owner, repo] = github.repository.split('/');
  const leetcodeCSRFToken = core.getInput('leetcode-csrf-token');
  const leetcodeSession = core.getInput('leetcode-session');
  const filterDuplicateSecs = core.getInput('filter-duplicate-secs');

  sync(githubToken, owner, repo, filterDuplicateSecs, leetcodeCSRFToken, leetcodeSession);
}

main().catch(error => core.setFailed(error));
