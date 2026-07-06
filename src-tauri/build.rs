fn main() {
    // Tell the linker where to find SimConnect.lib on Windows
    #[cfg(windows)]
    {
        let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_default();
        let bin_dir = format!("{}/bin", manifest_dir);

        // Check common SimConnect SDK locations for the .lib file
        let sdk_paths = [
            std::env::var("SIMCONNECT_SDK").ok(),
            Some(r"C:\MSFS SDK\SimConnect SDK\lib".to_string()),
            Some(r"C:\Program Files\Microsoft Flight Simulator SDK\SimConnect SDK\lib".to_string()),
            Some(bin_dir),
        ];

        for path in sdk_paths.iter().flatten() {
            if std::path::Path::new(path).exists() {
                println!("cargo:rustc-link-search=native={}", path);
                break;
            }
        }
    }

    tauri_build::build()
}
