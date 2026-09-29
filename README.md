<p align="center">
    <img src="images/leetcode_sync.png" width="250"/>
</p>

# LeetCode Sync

GitHub Action for automatically syncing LeetCode submissions to a GitHub repository.

## Features

- Syncs accepted solutions from LeetCode to the default branch of the GitHub repo
- Only syncs solutions that have not been synced before
- Uploads the latest accepted solution for a single problem if there are multiple submissions per day
- Optionally syncs [LeetCode Projects](https://leetcode.com/project/) submissions using the same folder layout as problems (see [LeetCode Projects](#leetcode-projects))

## How to use

1. Login to LeetCode and obtain the `csrftoken` and `LEETCODE_SESSION` cookie values.

   - After logging in, right-click on the page and press `Inspect`.
   - Refresh the page.
   - Look for a network request to https://leetcode.com.
   - Look under `Request Headers` for the `cookie:` attribute to find the values.

2. Create a new GitHub repository to host the LeetCode submissions.

   - It can be either private or public.

3. Add the values from step 1 as [GitHub secrets](https://docs.github.com/en/actions/configuring-and-managing-workflows/creating-and-storing-encrypted-secrets#creating-encrypted-secrets-for-a-repository),
   e.g. `LEETCODE_CSRF_TOKEN` and `LEETCODE_SESSION`.

4. Go to REPO > settings > actions and in Workflow Permissions section give actions Read and Write permissions.

5. Add a workflow file with this action under the `.github/workflows` directory, e.g. `sync_leetcode.yml`.

   Example workflow file:

   ```yaml
   name: Sync Leetcode

   on:
     workflow_dispatch:
     schedule:
       - cron: "0 8 * * 6"

   jobs:
     build:
       runs-on: ubuntu-latest

       steps:
         - name: Sync
           uses: joshcai/leetcode-sync@v1.7
           with:
             github-token: ${{ github.token }}
             leetcode-csrf-token: ${{ secrets.LEETCODE_CSRF_TOKEN }}
             leetcode-session: ${{ secrets.LEETCODE_SESSION }}
             destination-folder: my-folder
             verbose: true
             commit-header: "[LeetCode Sync]"
   ```

6. After you've submitted a LeetCode solution, run the workflow by going to the `Actions` tab, clicking the action name, e.g. `Sync Leetcode`, and then clicking `Run workflow`. The workflow will also automatically run once a week by default (can be configured via the `cron` parameter).

## Inputs

- `github-token` _(required)_: The GitHub access token for pushing solutions to the repository
- `leetcode-csrf-token` _(required)_: The LeetCode CSRF token for retrieving submissions from LeetCode
- `leetcode-session` _(required)_: The LeetCode session value for retrieving submissions from LeetCode
- `filter-duplicate-secs`: Number of seconds after an accepted solution to ignore other accepted solutions for the same problem, default: 86400 (1 day)
- `destination-folder` _(optional)_: The folder in your repo to save the submissions to (necessary for shared repos), default: _none_
- `verbose` _(optional)_: Adds submission percentiles and question numbers to the repo (requires an additional API call), default: true
- `commit-header` _(optional)_: How the automated commits should be prefixed, default: 'Sync LeetCode submission'
- `sync-projects` _(optional)_: Also sync [LeetCode Projects](https://leetcode.com/project/) submissions, using the same folder layout as problems, default: 'false'

## Shared Repos

Problems can be routed to a specific folder within a single repo using the `destination-folder` input field. This is useful for users who want to share a repo to add a more social, collaborative, or competitive aspect to their LeetCode sync repo.

## LeetCode Projects

[LeetCode Projects](https://leetcode.com/project/) are multi-file, system-design style problems that are graded with an automated report rather than a single solution snippet. Setting the `sync-projects` input to `true` syncs your successful project submissions alongside your regular problem solutions.

Projects use the same folder layout as regular problems: each project gets its own folder alongside your problem folders (under your `destination-folder`, if set), named `project-<slug>` (e.g. `project-rate-limiter`), containing the submission files plus a `README.md`.

For each project with a successful submission and an available report, the syncer:

- Creates a folder `project-<slug>/` (e.g. `project-rate-limiter`), at the same level as problem folders.
- Writes every file from the latest successful submission into that folder.
- Adds a `README.md` with the project title, difficulty, a link to the project, test results, the problem description, and any completed review sections. If the submission itself already contains a `README.md`, the generated one is written as `LEETCODE.md` instead so your file is not overwritten.
- Only the newest successful submission per project is kept; the folder mirrors that submission, so files removed between submissions are deleted.

Sync state for projects is tracked in a `projects_synced.json` file at the root of your repo (or under your `destination-folder`), so already-synced projects are skipped on subsequent runs.

Example workflow step:

```yaml
- name: Sync
  uses: joshcai/leetcode-sync@v1.7
  with:
    github-token: ${{ github.token }}
    leetcode-csrf-token: ${{ secrets.LEETCODE_CSRF_TOKEN }}
    leetcode-session: ${{ secrets.LEETCODE_SESSION }}
    sync-projects: true
```

## Contributing

#### Testing locally

If you want to test changes to the action locally without having to commit and run the workflow on GitHub, you can edit `src/test_config.js` to have the required config values and then run:

`$ node index.js test`

If you're using Replit, you can also just use the `Run` button, which is already configured to the above command.

#### Building the bundled action (`dist/`)

The action runs the bundled `dist/index.js`, which is generated from `src/` with [`@vercel/ncc`](https://github.com/vercel/ncc). To rebuild it locally:

`$ npm ci && npm run package`

If you'd rather not build locally, push your source change and let the `Build dist` GitHub Actions workflow rebuild the bundle on a clean runner. That workflow also fails if a committed `dist/` is out of date with `src/`, so the bundle stays in sync.

#### Adding a new workflow parameter

If you add a workflow parameter, please make sure to also add it in `src/test_config.js`, so that it can be tested locally.

You will need to manually run:

`$ git add -f src/test_config.js`

Since this file is in the `.gitignore` file to avoid users accidentally committing their key information.

## FAQ

#### Job fails with "HttpError: API rate limit exceeded for installation ID \<id\>"

This likely means that you hit a rate limit when committing to GitHub (this may happen if you have over ~300 submissions initially). Since the syncer writes in reverse chronological order, it should pick up syncing submissions from where it left off on the next run of the workflow, so just retry the workflow manually after some time.

#### Job fails with "HttpError: Resource not accessible by integration"

This means the github token you're using does not have permission to write to your repo. If you're using the default `github.token` method follow the instructions [here] (https://docs.github.com/en/actions/security-guides/automatic-token-authentication)

## Acknowledgements

Special thanks to the following people who helped beta test this GitHub Action and gave feedback on improving it:

- [dengl11](https://github.com/dengl11)
- [uakfdotb](https://github.com/uakfdotb)
- [hexecute](https://github.com/hexecute)
- [JonathanZhu11](https://github.com/JonathanZhu11)
