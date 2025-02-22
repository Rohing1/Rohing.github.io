import os

# 获取当前目录
folder_path = os.getcwd()
# 定义要替换的旧文本和新文本
old_text = 'IT迷途小书童'
new_text = 'Rohing'

# 遍历当前目录中的所有文件
for root, dirs, files in os.walk(folder_path):
    for file in files:
        if file.endswith('.html'):
            file_path = os.path.join(root, file)
            try:
                # 读取文件内容
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                # 替换文本
                new_content = content.replace(old_text, new_text)
                # 将替换后的内容写回文件
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                print(f"已替换 {file_path} 中的文本。")
            except Exception as e:
                print(f"处理 {file_path} 时出错: {e}")