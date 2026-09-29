// LeetCode Projects (leetcode.com/project) sync support.
//
// Ported from the sync-leetcode reference implementation and adapted to this
// repo's conventions: axios for LeetCode GraphQL (sharing the same headers and
// retry/backoff behavior as src/action.js) and Octokit for an atomic
// multi-file commit that mirrors the latest successful submission.
//
// The GraphQL fields used here (projectSubmissionList, projectProblemDetail,
// projectSubmissionReport) were validated against the live leetcode.com schema.

const axios = require("axios");

const GRAPHQL_URL = "https://leetcode.com/graphql/";
const PAGE = 20;

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

function log(message) {
  console.log(`[${new Date().toUTCString()}] ${message}`);
}

// synced state key for a project, kept apart from problem slugs.
const stateKey = (slug) => `project:${slug}`;

// Normalize a name the same way problem folders are named in action.js:
// lowercase, spaces to dashes, strip anything that isn't [a-z0-9_-].
function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/\s/g, "-")
    .replace(/[^a-zA-Z0-9_-]/gi, "");
}

// Folder named like a problem, but prefixed to mark it as a project:
// slug "rate-limiter" -> "project-rate-limiter". Falls back to the title
// if the slug is missing.
const folderName = (slug, title) => `project-${normalizeName(slug || title)}`;

// "codeQuality" -> "Code Quality"
const humanize = (id) =>
  id.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

function graphqlHeaders(session, csrfToken) {
  return {
    "content-type": "application/json",
    origin: "https://leetcode.com",
    referer: "https://leetcode.com",
    cookie: `csrftoken=${csrfToken}; LEETCODE_SESSION=${session};`,
    "x-csrftoken": csrfToken,
  };
}

// Minimal dependency-free HTML -> text conversion for project descriptions,
// which may come back as HTML or already-markdown text. This avoids pulling in
// a new dependency (the reference used turndown).
function htmlToText(html) {
  return (html || "")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// POST a GraphQL query with retry/backoff, matching the pattern in action.js.
async function gql(query, variables, session, csrfToken, maxRetries = 5) {
  const data = JSON.stringify({ query, variables });
  const headers = graphqlHeaders(session, csrfToken);
  const attempt = async (retryCount = 0) => {
    try {
      const response = await axios.post(GRAPHQL_URL, data, { headers });
      if (response.data && response.data.errors) {
        throw new Error(
          `LeetCode GraphQL error: ${JSON.stringify(response.data.errors)}`
        );
      }
      return response.data.data;
    } catch (exception) {
      if (retryCount >= maxRetries) {
        throw exception;
      }
      log(
        "Error querying LeetCode projects, retrying in " +
          3 ** retryCount +
          " seconds..."
      );
      await delay(3 ** retryCount * 1000);
      return attempt(retryCount + 1);
    }
  };
  return attempt();
}

async function projectSubmissionsPage(skip, limit, session, csrfToken) {
  const query = `query ($skip: Int, $limit: Int) {
    projectSubmissionList(skip: $skip, limit: $limit) {
      hasMore
      nodes { id problemSlug status createdAt reportAvailable }
    }
  }`;
  const data = await gql(query, { skip, limit }, session, csrfToken);
  return data.projectSubmissionList ?? { hasMore: false, nodes: [] };
}

async function projectDetail(slug, session, csrfToken) {
  const query = `query ($s: String!) {
    projectProblemDetail(problemSlug: $s) {
      slug title difficulty summary description languages
    }
  }`;
  const data = await gql(query, { s: slug }, session, csrfToken);
  if (!data.projectProblemDetail) {
    throw new Error(`No project found for slug "${slug}"`);
  }
  return data.projectProblemDetail;
}

// Returns null while the report is still being generated.
async function projectReport(slug, id, session, csrfToken) {
  const query = `query ($s: String!, $id: ID!) {
    projectSubmissionReport(problemSlug: $s, id: $id) {
      status errorMessage reportJson
    }
  }`;
  const data = await gql(query, { s: slug, id }, session, csrfToken);
  const r = data.projectSubmissionReport;
  if (!r || !r.reportJson) {
    return null;
  }
  return JSON.parse(r.reportJson);
}

function buildReadme(detail, report) {
  const description = /<[a-z][^>]*>/i.test(detail.description)
    ? htmlToText(detail.description)
    : (detail.description || "").trim();

  const lines = [
    `# ${detail.title}   [${detail.difficulty}]`,
    ``,
    `https://leetcode.com/project/${detail.slug}/`,
    ``,
    `Tests: ${report.tests.passed}/${report.tests.total} passed   Submitted: ${report.submittedAt}`,
    ``,
    description,
  ];

  const sections = Object.entries(report.analysis ?? {}).filter(
    ([, s]) => s.status === "completed" && s.contentMarkdown
  );
  if (sections.length > 0) {
    lines.push(``, `---`, ``, `# Review`);
    for (const [id, s] of sections) {
      const rating =
        s.rating && s.rating !== "not_evaluated"
          ? ` (${s.rating.replace(/_/g, " ")})`
          : "";
      lines.push(``, `## ${humanize(id)}${rating}`, ``, s.contentMarkdown.trim());
    }
  }
  return lines.join("\n") + "\n";
}

// Write many files in a single commit via the git data API. Files already under
// `replaceDir` that aren't in `files` are deleted, so the folder mirrors the
// latest submission.
async function commitFiles(params) {
  const { octokit, owner, repo, files, message, replaceDir } = params;

  const repoInfo = await octokit.repos.get({ owner, repo });
  const branch = repoInfo.data.default_branch;
  const ref = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${branch}`,
  });
  const headSha = ref.data.object.sha;
  const headCommit = await octokit.git.getCommit({
    owner,
    repo,
    commit_sha: headSha,
  });
  const baseTreeSha = headCommit.data.tree.sha;

  const entries = files.map((f) => ({
    path: f.path,
    mode: "100644",
    type: "blob",
    content: f.content,
  }));

  if (replaceDir) {
    const keep = new Set(files.map((f) => f.path));
    const tree = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: baseTreeSha,
      recursive: "1",
    });
    for (const e of tree.data.tree) {
      if (
        e.type === "blob" &&
        e.path.startsWith(`${replaceDir}/`) &&
        !keep.has(e.path)
      ) {
        entries.push({ path: e.path, mode: e.mode, type: "blob", sha: null });
      }
    }
  }

  const newTree = await octokit.git.createTree({
    owner,
    repo,
    base_tree: baseTreeSha,
    tree: entries,
  });
  const commit = await octokit.git.createCommit({
    owner,
    repo,
    message,
    tree: newTree.data.sha,
    parents: [headSha],
  });
  await octokit.git.updateRef({
    owner,
    repo,
    ref: `heads/${branch}`,
    sha: commit.data.sha,
  });
}

// Push the newest successful submission of each project to <prefix>project-<slug>/,
// alongside the problem folders (same structure: README.md + submission files).
// `all` walks every page (backfill); otherwise only the most recent page is checked.
// Returns the number of projects that were (re)synced.
async function syncProjects(params) {
  const {
    octokit,
    owner,
    repo,
    leetcodeSession,
    leetcodeCSRFToken,
    synced,
    destinationFolder,
    all,
  } = params;

  const cleanDest =
    !destinationFolder || destinationFolder === "." || destinationFolder === "./"
      ? ""
      : destinationFolder.replace(/\/$/, "");
  const prefix = cleanDest ? `${cleanDest}/` : "";
  const seen = new Set(); // newest successful submission per project wins
  let changed = 0;

  for (let skip = 0; ; skip += PAGE) {
    const page = await projectSubmissionsPage(
      skip,
      PAGE,
      leetcodeSession,
      leetcodeCSRFToken
    );
    for (const sub of page.nodes) {
      if (sub.status !== "SUCCESS" || !sub.reportAvailable) continue;
      if (seen.has(sub.problemSlug)) continue;
      seen.add(sub.problemSlug);
      if (synced[stateKey(sub.problemSlug)] === sub.id) continue;

      const [detail, report] = await Promise.all([
        projectDetail(sub.problemSlug, leetcodeSession, leetcodeCSRFToken),
        projectReport(
          sub.problemSlug,
          sub.id,
          leetcodeSession,
          leetcodeCSRFToken
        ),
      ]);

      if (!report || !report.submission || !report.submission.files.length) {
        log(
          `Skipping project ${sub.problemSlug}: report for submission ${sub.id} has no files yet.`
        );
        continue;
      }

      const dir = `${prefix}${folderName(detail.slug, detail.title)}`;
      const files = report.submission.files.map((f) => ({
        path: `${dir}/${f.path}`,
        content: f.content,
      }));
      // don't clobber a README.md the submission itself contains
      const readmePath = files.some((f) => f.path === `${dir}/README.md`)
        ? `${dir}/LEETCODE.md`
        : `${dir}/README.md`;
      files.push({ path: readmePath, content: buildReadme(detail, report) });

      await commitFiles({
        octokit,
        owner,
        repo,
        files,
        message: `Sync project ${detail.title}`,
        replaceDir: dir,
      });
      synced[stateKey(sub.problemSlug)] = sub.id;
      changed++;
      log(`Synced project ${detail.title}`);
      await delay(600);
    }
    if (!all || !page.hasMore) break;
    await delay(800);
  }

  return changed;
}

module.exports = { syncProjects };
