## Getting Started

To set up and run the dashboard locally, follow these steps:

1. Change directory to the dashboard folder:
  ```
  cd dashboard
  ```

2. Make sure you are using Node.js version 22.  
  - To check your current Node.js version:
    ```
    node -v
    ```
  - If you have [`nvm`](https://github.com/nvm-sh/nvm) (Node Version Manager) installed, you can switch to version 22 with:
    ```
    nvm use 22
    ```
  - If you don't have version 22 installed, you can install it with:
    ```
    nvm install 22
    ```
  - If you don't have `nvm`, you can find installation instructions [here](https://github.com/nvm-sh/nvm).

3. Install dependencies:
  ```
  npm install
  ```

4. Start the development server:
  ```
  npm run dev
  ```

## Getting started on MacOS (if above doesn't work)

# Install Node.js 22 using Homebrew
`brew install node@22`

# Add to PATH permanently
`echo 'export PATH="/opt/homebrew/opt/node@22/bin:$PATH"' >> ~/.zshrc`

# Reload shell or run this in current session
`export PATH="/opt/homebrew/opt/node@22/bin:$PATH"`

# Verify installation
`node -v  # Should show v22.19.0`

`cd /path/to/your/deutsche-bahn-statistics/dashboard`

# Install yarn globally (more reliable than npm)
`npm install -g yarn`

# Install project dependencies
`yarn install`

`npm run dev`