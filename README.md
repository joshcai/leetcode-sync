# leetcode-sync
GitHub Action for syncing LeetCode submissions to a GitHub repository.

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
          uses: joshcai/leetcode-sync@v1.0
          with:
            github-token: ${{ github.token }}
            leetcode-csrf-token: ${{ secrets.LEETCODE_CSRF_TOKEN }}
            leetcode-session: ${{ secrets.LEETCODE_SESSION }}
    ```

5. Run the workflow by going to the `Actions` tab, clicking the action name, e.g. `Sync Leetcode`, and then clicking `Run workflow`. The workflow will also automatically run once a week by default (can be configured via the `cron` parameter).
