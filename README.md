<p align="center">
  <br>
    <img src="leetcode_sync_transparent.png" width="150"/>
  <br>
</p>

# LeetCode Sync
GitHub Action for automatically syncing LeetCode submissions to a GitHub repository.

## Features

- Syncs accepted solutions from LeetCode
- Only syncs solutions that have not been synced before
- Uploads the latest accepted solution for a single problem if there are multiple submissions per day

## How to use

1. Login to LeetCode and obtain the `csrftoken` and `LEETCODE_SESSION` cookie values.

    - After logging in, right-click on the page and press `Inspect`.
    - Refresh the page.
    - Look for a network request to https://leetcode.com.
    - Look under `Request Headers` for the `cookie:` attribute to find the values.

2. Create a new GitHub repository to host the LeetCode submissions.

    - Make sure to have at least one commit, e.g. you can initialize the repository with a README.
    - It can be either private or public.

3. Add the values from step 1 as [GitHub secrets](https://docs.github.com/en/actions/configuring-and-managing-workflows/creating-and-storing-encrypted-secrets#creating-encrypted-secrets-for-a-repository), 
   e.g. `LEETCODE_CSRF_TOKEN` and `LEETCODE_SESSION`.

4. Add a workflow file with this action under the `.github/workflows` directory, e.g. `sync_leetcode.yml`.

    Example workflow file:

    ```yaml
    name: Sync Leetcode

    on:
      workflow_dispatch:
      schedule:
        - cron:  '0 8 * * 6'

    jobs:
      build:
        runs-on: ubuntu-latest

        steps:
        - name: Sync
          uses: joshcai/leetcode-sync@v1.1
          with:
            github-token: ${{ github.token }}
            leetcode-csrf-token: ${{ secrets.LEETCODE_CSRF_TOKEN }}
            leetcode-session: ${{ secrets.LEETCODE_SESSION }}
    ```

5. Run the workflow by going to the `Actions` tab, clicking the action name, e.g. `Sync Leetcode`, and then clicking `Run workflow`. The workflow will also automatically run once a week by default (can be configured via the `cron` parameter).

## Inputs

- `github-token` *(required)*: The GitHub access token for pushing solutions to the repository
- `leetcode-csrf-token` *(required)*: The LeetCode CSRF token for retrieving submissions from LeetCode
- `leetcode-session` *(required)*: The LeetCode session value for retrieving submissions from LeetCode
- `filter-duplicate-secs`: Number of seconds after an accepted solution to ignore other accepted solutions for the same problem, default: 86400 (1 day)
