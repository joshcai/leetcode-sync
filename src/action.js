const axios = require("axios");
const { Octokit } = require("@octokit/rest");
const path = require("path");

const COMMIT_MESSAGE = "Sync LeetCode submission";
const LANG_TO_EXTENSION = {
  bash: "sh",
  c: "c",
  cpp: "cpp",
  csharp: "cs",
  dart: "dart",
  elixir: "ex",
  erlang: "erl",
  golang: "go",
  java: "java",
  javascript: "js",
  kotlin: "kt",
  mssql: "sql",
  mysql: "sql",
  oraclesql: "sql",
  php: "php",
  python: "py",
  python3: "py",
  pythondata: "py",
  postgresql: "sql",
  racket: "rkt",
  ruby: "rb",
  rust: "rs",
  scala: "scala",
  swift: "swift",
  typescript: "ts",
};
const BASE_URL = "https://leetcode.com";

const delay = ms => new Promise(res => setTimeout(res, ms));

function log(message) {
  console.log(`[${new Date().toUTCString()}] ${message}`);
}

function pad(n) {
  if (n.length > 4) {
    return n;
  }
  var s = "000" + n;
  return s.substring(s.length - 4);
}

function normalizeName(problemName) {
  return problemName
    .toLowerCase()
    .replace(/\s/g, "-")
    .replace(/[^a-zA-Z0-9_-]/gi, "");
}

function graphqlHeaders(session, csrfToken) {
  return {
    "content-type": "application/json",
    origin: BASE_URL,
    referer: BASE_URL,
    cookie: `csrftoken=${csrfToken}; LEETCODE_SESSION=${session};`,
    "x-csrftoken": csrfToken,
  };
}

async function getInfo(submission, session, csrfToken) {
  let data = JSON.stringify({
    query: `query submissionDetails($submissionId: Int!) {
      submissionDetails(submissionId: $submissionId) {
        runtimePercentile
        memoryPercentile
        code
        question {
          questionId
        }
      }
    }`,
    variables: { submissionId: submission.id },
  });

  const headers = graphqlHeaders(session, csrfToken);

  // No need to break on first request error since that would be done when getting submissions
  const getInfo = async (maxRetries = 5, retryCount = 0) => {
    try {
      const response = await axios.post("https://leetcode.com/graphql/", data, {
        headers,
      });
      const submissionDetails = response.data?.data?.submissionDetails;

      const runtimePercentile =
        submissionDetails.runtimePercentile !== null &&
        submissionDetails.runtimePercentile !== undefined
          ? `${submissionDetails.runtimePercentile.toFixed(2)}%`
          : "N/A";

      const memoryPercentile =
        submissionDetails.memoryPercentile !== null &&
        submissionDetails.memoryPercentile !== undefined
          ? `${submissionDetails.memoryPercentile.toFixed(2)}%`
          : "N/A";

      const questionId = submissionDetails?.question?.questionId
        ? pad(submissionDetails.question.questionId.toString())
        : "N/A";

      log(`Got info for submission #${submission.id}`);
      return {
        runtimePerc: runtimePercentile,
        memoryPerc: memoryPercentile,
        qid: questionId,
        code: response.data.data.submissionDetails.code,
      };
    } catch (exception) {
      if (retryCount >= maxRetries) {
        // If problem is locked due to user not having LeetCode Premium
        if (exception.response && exception.response.status === 403) {
          log(`Skipping locked problem: ${submission.title}`);
          return null;
        }
        throw exception;
      }
      log(
        "Error fetching submission info, retrying in " +
          3 ** retryCount +
          " seconds..."
      );
      await delay(3 ** retryCount * 1000);
      return getInfo(maxRetries, retryCount + 1);
    }
  };

  info = await getInfo();
  return { ...submission, ...info };
}

async function commit(params) {
  const {
    octokit,
    owner,
    repo,
    defaultBranch,
    commitInfo,
    treeSHA,
    latestCommitSHA,
    submission,
    destinationFolder,
    commitHeader,
    questionData,
  } = params;

  const name = normalizeName(submission.title);
  log(`Committing solution for ${name}...`);

  if (!LANG_TO_EXTENSION[submission.lang]) {
    throw `Language ${submission.lang} does not have a registered extension.`;
  }

  const prefix = !!destinationFolder ? destinationFolder : "";
  const commitName = !!commitHeader ? commitHeader : COMMIT_MESSAGE;

  if ("runtimePerc" in submission) {
    message = `${commitName} - ${submission.title} - Runtime - ${submission.runtime} (${submission.runtimePerc}), Memory - ${submission.memory} (${submission.memoryPerc})`;
    qid = `${submission.qid}-`;
  } else {
    message = `${commitName} - ${submission.title} - Runtime - ${submission.runtime}, Memory - ${submission.memory}`;
    qid = "";
  }
  const folderName = `${qid}${name}`;
  // Markdown file for the problem with question data
  const questionPath = path.join(prefix, folderName, "README.md");

  // Separate file for the solution
  const solutionFileName = `solution.${LANG_TO_EXTENSION[submission.lang]}`;
  const solutionPath = path.join(prefix, folderName, solutionFileName);

  const treeData = [
    {
      path: path.normalize(questionPath),
      mode: "100644",
      content: questionData ?? "Unable to fetch the Problem statement.",
    },
    {
      path: path.normalize(solutionPath),
      mode: "100644",
      content: `${submission.code}\n`, // Adds newline at EOF to conform to git recommendations
    },
  ];

  const treeResponse = await octokit.git.createTree({
    owner: owner,
    repo: repo,
    base_tree: treeSHA,
    tree: treeData,
  });

  const date = new Date(Number(submission.timestamp) * 1000).toISOString();
  const commitResponse = await octokit.git.createCommit({
    owner: owner,
    repo: repo,
    message: message,
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
  });

  await octokit.git.updateRef({
    owner: owner,
    repo: repo,
    sha: commitResponse.data.sha,
    ref: "heads/" + defaultBranch,
    force: true,
  });

  log(`Committed solution for ${name}`);

  return [treeResponse.data.sha, commitResponse.data.sha];
}

async function getQuestionData(titleSlug, leetcodeSession, csrfToken) {
  log(`Getting question data for ${titleSlug}...`);

  const headers = graphqlHeaders(leetcodeSession, csrfToken);
  const graphql = JSON.stringify({
    query: `query getQuestionDetail($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        content
      }
    }`,
    variables: { titleSlug: titleSlug },
  });

  try {
    const response = await axios.post(
      "https://leetcode.com/graphql/",
      graphql,
      { headers }
    );
    const result = await response.data;
    return result.data.question.content;
  } catch (error) {
    // If problem is locked due to user not having LeetCode Premium
    if (error.response && error.response.status === 403) {
      log(`Skipping locked problem: ${titleSlug}`);
      return null;
    }
    console.log("error", error);
  }
}

// Returns false if no more submissions should be added.
function addToSubmissions(params) {
  const {
    response,
    lastTimestamp,
    filterDuplicateSecs,
    submissions_dict,
    submissions,
  } = params;

  if (!response?.data?.data?.submissionList?.submissions) {
    throw new Error(
      "No LeetCode submissions found. This may be caused by an expired session. " +
        "Please check if your LEETCODE_SESSION environment variable is valid and up to date."
    );
  }

  for (const submission of response.data.data.submissionList.submissions) {
    submissionTimestamp = Number(submission.timestamp);
    if (submissionTimestamp <= lastTimestamp) {
      return false;
    }
    if (submission.statusDisplay !== "Accepted") {
      continue;
    }
    const name = normalizeName(submission.title);
    const lang = submission.lang;
    if (!submissions_dict[name]) {
      submissions_dict[name] = {};
    }
    // Filter out other accepted solutions less than one day from the most recent one.
    if (
      submissions_dict[name][lang] &&
      submissions_dict[name][lang] - submissionTimestamp < filterDuplicateSecs
    ) {
      continue;
    }
    submissions_dict[name][lang] = submissionTimestamp;
    submissions.push(submission);
  }
  return true;
}

async function sync(inputs) {
  const {
    githubToken,
    owner,
    repo,
    leetcodeCSRFToken,
    leetcodeSession,
    filterDuplicateSecs,
    destinationFolder,
    verbose,
    commitHeader,
  } = inputs;

  const octokit = new Octokit({
    auth: githubToken,
    userAgent: "LeetCode sync to GitHub - GitHub Action",
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
  let commitInfo = commits.data[commits.data.length - 1].commit.author;
  for (const commit of commits.data) {
    if (
      !commit.commit.message.startsWith(
        !!commitHeader ? commitHeader : COMMIT_MESSAGE
      )
    ) {
      continue;
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
    log(`Getting submission from LeetCode, offset ${offset}`);

    const getSubmissions = async (maxRetries, retryCount = 0) => {
      try {
        const slug = undefined;
        const graphql = JSON.stringify({
          query: `query ($offset: Int!, $limit: Int!, $slug: String) {
              submissionList(offset: $offset, limit: $limit, questionSlug: $slug) {
                  hasNext
                  submissions {
                      id
                      lang
                      timestamp
                      statusDisplay
                      runtime
                      title
                      memory
                      titleSlug
                  }
              }
          }`,
          variables: {
            offset: offset,
            limit: 20,
            slug,
          },
        });

        const headers = graphqlHeaders(leetcodeSession, leetcodeCSRFToken);
        const response = await axios.post(
          "https://leetcode.com/graphql/",
          graphql,
          { headers }
        );

        log(`Successfully fetched submission from LeetCode, offset ${offset}`);
        return response;
      } catch (exception) {
        if (retryCount >= maxRetries) {
          throw exception;
        }
        log(
          "Error fetching submissions, retrying in " +
            3 ** retryCount +
            " seconds..."
        );
        // There's a rate limit on LeetCode API, so wait with backoff before retrying.
        await delay(3 ** retryCount * 1000);
        return getSubmissions(maxRetries, retryCount + 1);
      }
    };
    // On the first attempt, there should be no rate limiting issues, so we fail immediately in case
    // the tokens are configured incorrectly.
    const maxRetries = response === null ? 0 : 5;
    if (response !== null) {
      // Add a 1 second delay before all requests after the initial request.
      await delay(1000);
    }
    response = await getSubmissions(maxRetries);
    if (
      !addToSubmissions({
        response,
        lastTimestamp,
        filterDuplicateSecs,
        submissions_dict,
        submissions,
      })
    ) {
      break;
    }

    offset += 20;
  } while (response.data.data.submissionList.hasNext);

  // We have all submissions we want to write to GitHub now.
  // First, get the default branch to write to.
  const repoInfo = await octokit.repos.get({
    owner: owner,
    repo: repo,
  });
  const defaultBranch = repoInfo.data.default_branch;
  log(`Default branch for ${owner}/${repo}: ${defaultBranch}`);
  // Write in reverse order (oldest first), so that if there's errors, the last sync time
  // is still valid.
  log(`Syncing ${submissions.length} submissions...`);
  let latestCommitSHA = commits.data[0].sha;
  let treeSHA = commits.data[0].commit.tree.sha;
  for (i = submissions.length - 1; i >= 0; i--) {
    submission = await getInfo(
      submissions[i],
      leetcodeSession,
      leetcodeCSRFToken
    );

    if (submission === null) {
      // Skip this submission if it is null (locked problem)
      continue;
    }

    // Get the question data for the submission.
    const questionData = await getQuestionData(
      submission.titleSlug,
      leetcodeSession,
      leetcodeCSRFToken
    );
    if (questionData === null) {
      // Skip this submission if question data is null (locked problem)
      continue;
    }
    [treeSHA, latestCommitSHA] = await commit({
      octokit,
      owner,
      repo,
      defaultBranch,
      commitInfo,
      treeSHA,
      latestCommitSHA,
      submission,
      destinationFolder,
      commitHeader,
      questionData,
    });
  }
  log("Done syncing all submissions.");
}

module.exports = { log, sync };
