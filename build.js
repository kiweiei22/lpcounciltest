
import fs from 'fs';
import path from 'path';

const distDir = 'dist';

// Create dist dir
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir);
}

// Function to copy file
function copyFile(src, dest) {
    fs.copyFileSync(src, dest);
    console.log(`Copied ${src} -> ${dest}`);
}

// Function to copy directory
function copyDir(src, dest) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest);
    const files = fs.readdirSync(src);
    for (const file of files) {
        const srcPath = path.join(src, file);
        const destPath = path.join(dest, file);
        const stat = fs.statSync(srcPath);
        if (stat.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            copyFile(srcPath, destPath);
        }
    }
}

// Copy Static Files
try {
    const filesToCopy = ['index.html', 'admin.html', 'manifest.json'];
    filesToCopy.forEach(f => {
        if (fs.existsSync(f)) copyFile(f, path.join(distDir, f));
    });

    // Copy Directories
    if (fs.existsSync('css')) copyDir('css', path.join(distDir, 'css'));
    if (fs.existsSync('js')) copyDir('js', path.join(distDir, 'js'));
    // Copry images if exists
    if (fs.existsSync('images')) copyDir('images', path.join(distDir, 'images'));
    if (fs.existsSync('assets')) copyDir('assets', path.join(distDir, 'assets'));

    console.log('Build completed successfully!');
} catch (e) {
    console.error('Build failed:', e);
    process.exit(1);
}
