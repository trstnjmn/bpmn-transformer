# BPMN Transformer

BPMN Transformer is a powerful web-based utility designed to convert, validate, and magically auto-layout Business Process Model and Notation (BPMN) diagrams. Originally built to bridge the gap between Prooph Board XML and standard BPMN 2.0 XML, it offers a fast, reliable, and user-friendly interface.

## 🚀 Features

- **Prooph XML to BPMN 2.0:** Seamlessly convert Prooph Board XML outputs into valid, standard BPMN 2.0 diagrams.
- **Auto-Layout with ELK:** Automatically generates well-structured, visually appealing layouts for your BPMN processes using the powerful ELK (Eclipse Layout Kernel) engine.
- **Data Conversion:**
  - **XML ➔ BPMN:** Direct conversion with layout generation.
  - **XML ➔ JSON:** Parse any XML into a clean, structural JSON representation.
  - **JSON ➔ XML:** Convert valid JSON object structures back to valid BPMN 2.0 XML.
- **Interactive UI:** A modern, dark/light mode compatible interface powered by React and Tailwind CSS.
- **Export & Copy:** Easily copy your converted code to the clipboard or download it as a `.bpmn` or `.json` file.

## 🛠️ Tech Stack

- **Framework:** [React 19](https://react.dev/) + [Vite](https://vitejs.dev/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **BPMN Handling:** `bpmn-moddle` for BPMN 2.0 semantic validation and parsing.
- **XML Parsing:** `fast-xml-parser` for high-performance conversions.
- **Layouting:** `elkjs` for calculating intelligent, non-overlapping routes for sequences and tasks.
- **Icons:** [Lucide React](https://lucide.dev/)

## 📦 Installation & Setup

1. **Clone the repository** (if you haven't already):
   ```bash
   git clone <repository-url>
   cd bpmn-transformer
   ```

2. **Install dependencies:**
   Make sure you have Node.js installed. Then, run:
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```
   The application will be available at `http://localhost:5173/`.

4. **Build for production:**
   ```bash
   npm run build
   ```

## 💡 Usage

1. **Select a Mode:** Choose the desired conversion path using the tabs at the top (XML ➔ BPMN, XML ➔ JSON, JSON ➔ XML).
2. **Input your Data:** 
   - Paste your XML or JSON text directly into the left "Input" panel.
   - Alternatively, click **Upload File** to load an existing `.xml`, `.bpmn`, or `.json` file from your computer.
3. **Transform:** Click **Run Transformation**. The tool will process the input, calculate the layout (if applicable), and display the result in the right "Output" panel.
4. **Export:** Use the **Copy** button to copy the result to your clipboard, or **Download** to save it as a local file.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!
Feel free to check the issues page if you want to contribute.

## 📝 License

© 2026 BPMN Transformer Tool.
