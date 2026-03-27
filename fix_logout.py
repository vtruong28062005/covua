import re

file_path = r'C:\Users\dell\.gemini\antigravity\scratch\chess-app\index.html'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Find and fix the logout button line that has corrupted Vietnamese text
# The corrupted text came from a previous PowerShell write
old = "setView('auth');}} className=\"text-white/40 shrink-0 hover:text-red-400 text-xs font-bold bg-white/5 py-1 px-3 rounded-full transition-colors\">Dang xu?t"
new = "setView('landing');}} className=\"text-white/40 shrink-0 hover:text-red-400 text-xs font-bold bg-white/5 py-1 px-3 rounded-full transition-colors\">\u0110\u0103ng xu\u1ea5t"

if old in content:
    content = content.replace(old, new)
    print('SUCCESS: Fixed logout button')
else:
    # Try an alternative - find the Dang xu?t part
    idx = content.find('Dang xu?t')
    if idx >= 0:
        print(f'Found corrupted text at index {idx}')
        print('Context:', repr(content[idx-100:idx+50]))
    else:
        print('Corrupted text not found')
        # Check if already fixed
        if 'Đăng xuất' in content:
            # Just fix the setView('auth') -> setView('landing') for logout button
            old2 = "localStorage.removeItem(DB_CURRENT); setView('auth');"
            new2 = "localStorage.removeItem(DB_CURRENT); setView('landing');"
            if old2 in content:
                # Count occurrences - let's identify which one is logout
                count = content.count(old2)
                print(f'Found {count} occurrences of old text')
                # We only want to replace the one on the logout button line
                # The home screen has the logout button with 'Đăng xuất' text following
                idx = content.find(old2)
                while idx >= 0:
                    ctx = content[idx:idx+200]
                    if 'Đăng xuất' in ctx or 'xu' in ctx:
                        print('Found in context:', repr(ctx[:120]))
                        break
                    idx = content.find(old2, idx+1)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print('File written successfully')
