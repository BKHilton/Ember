# Blank Screen Fix - Debugging Steps

## Changes Made

I've added comprehensive error handling and logging to help diagnose the blank screen issue:

### 1. **Main Process (`src/main/index.ts`)**
   - Added console logging for preload path and renderer URL
   - Added error handler for failed page loads
   - DevTools now opens automatically in dev mode to see console errors

### 2. **Preload Script (`src/preload/index.ts`)**
   - Added console log to confirm preload script loads successfully

### 3. **Renderer Entry (`src/renderer/src/main.tsx`)**
   - Added check for `window.api` availability before mounting React
   - Added error message display if preload script fails to load
   - Added 100ms delay to ensure preload script has time to execute

### 4. **App Component (`src/renderer/src/App.tsx`)**
   - Added safety check for `window.api` before using it
   - Added error handling in session loading

## Next Steps to Diagnose

1. **Run the dev server:**
   ```powershell
   npm run dev
   ```

2. **Check the terminal output** for:
   - "Dev mode - Preload path: ..."
   - "Loading renderer from URL: ..." or "Loading renderer from file: ..."
   - Any error messages about failed loads

3. **Check the DevTools console** (should open automatically):
   - Look for "Preload script loaded, window.api exposed"
   - Look for "window.api is available, mounting React app"
   - Look for any red error messages

4. **Common Issues to Look For:**

   **If you see "Failed to load" errors:**
   - The renderer URL might not be set correctly
   - Check if `ELECTRON_RENDERER_URL` environment variable is being set

   **If you see "window.api is not defined" errors:**
   - The preload script path might be incorrect
   - Check if the preload script file exists at the expected path
   - The preload script might be failing to execute

   **If you see React errors:**
   - Check the console for specific React error messages
   - Verify all dependencies are installed (`npm install`)

5. **If the screen is still blank after these checks:**
   - Open DevTools manually (View → Toggle Developer Tools or Ctrl+Shift+I)
   - Check the Console tab for errors
   - Check the Network tab to see if resources are loading
   - Check the Elements tab to see if the DOM is being created

## Additional Debugging

If the issue persists, try:

1. **Clear the build cache:**
   ```powershell
   Remove-Item -Recurse -Force dist
   npm run dev
   ```

2. **Check if node_modules are up to date:**
   ```powershell
   npm install
   ```

3. **Verify electron-vite is working:**
   Check the terminal output when running `npm run dev` - you should see:
   - Vite dev server starting
   - Electron main process starting
   - No build errors

4. **Check file paths:**
   Verify these files exist:
   - `dist/preload/index.js` (built preload script)
   - `src/renderer/index.html`
   - `src/renderer/src/main.tsx`

## Expected Console Output (Success)

When everything works, you should see in the terminal:
```
Dev mode - Preload path: C:\source\repo\Ember\dist\preload\index.js
Loading renderer from URL: http://localhost:XXXX
```

And in the DevTools console:
```
Preload script loaded, window.api exposed
window.api is available, mounting React app
```

## Report Back

After running `npm run dev`, please share:
1. The terminal output (especially any errors)
2. The DevTools console output
3. Whether the screen is still blank or if you see any error messages

This will help identify the exact cause of the blank screen.

