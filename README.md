# leetcode-sync
GitHub Action for syncing LeetCode submissions to a GitHub repository.

To use this action:

1. Login to LeetCode and obtain the `csrftoken` and `LEETCODE_SESSION` cookie values.

    - After logging in, right-click on the page and press `Inspect`.
    - Refresh the page.
    - Look for a network request to https://leetcode.com.
    - Look under `Request Headers` for the `cookie:` attribute to find the values.

2. Add the values as [GitHub secrets](https://docs.github.com/en/actions/configuring-and-managing-workflows/creating-and-storing-encrypted-secrets#creating-encrypted-secrets-for-a-repository), 
   e.g. `LEETCODE_CSRF_TOKEN` and `LEETCODE_SESSION`.

3. Add a workflow file with this action under the `.github/workflows` directory, e.g. `sync_leetcode.yml`:

Example workflow file:

```yaml
name: Sync Leetcode

on:
  schedule:
    - cron:  '0 8 * * *'

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