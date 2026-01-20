// =============================================================================
// Output Capture - Redirects stdout/stderr to the frontend
// =============================================================================

#[cfg(unix)]
mod unix_capture {
    use std::io::{BufRead, BufReader};
    use std::os::unix::io::FromRawFd;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::thread;
    use tauri::{AppHandle, Emitter};

    static CAPTURE_ACTIVE: AtomicBool = AtomicBool::new(false);

    /// Payload for output events sent to the frontend
    #[derive(Clone, serde::Serialize)]
    pub struct OutputPayload {
        pub stream: String, // "stdout" or "stderr"
        pub text: String,
    }

    /// Start capturing stdout and stderr, forwarding to the frontend via events
    pub fn start_capture(app_handle: AppHandle) {
        if CAPTURE_ACTIVE.swap(true, Ordering::SeqCst) {
            // Already capturing
            return;
        }

        // Capture stdout
        if let Some(read_fd) = redirect_fd(libc::STDOUT_FILENO) {
            let handle = app_handle.clone();
            thread::spawn(move || {
                read_and_emit(read_fd, "stdout", handle);
            });
        }

        // Capture stderr
        if let Some(read_fd) = redirect_fd(libc::STDERR_FILENO) {
            let handle = app_handle.clone();
            thread::spawn(move || {
                read_and_emit(read_fd, "stderr", handle);
            });
        }

        log::info!("[Output Capture] Started capturing stdout/stderr");
    }

    /// Redirect a file descriptor to a pipe, returning the read end
    fn redirect_fd(target_fd: libc::c_int) -> Option<libc::c_int> {
        unsafe {
            // Create a pipe
            let mut pipe_fds: [libc::c_int; 2] = [0; 2];
            if libc::pipe(pipe_fds.as_mut_ptr()) != 0 {
                log::error!("[Output Capture] Failed to create pipe");
                return None;
            }

            let read_fd = pipe_fds[0];
            let write_fd = pipe_fds[1];

            // Redirect target_fd to the write end of the pipe
            if libc::dup2(write_fd, target_fd) == -1 {
                log::error!("[Output Capture] Failed to redirect fd {}", target_fd);
                libc::close(read_fd);
                libc::close(write_fd);
                return None;
            }

            // Close the write end in this thread (it's now duplicated to target_fd)
            libc::close(write_fd);

            Some(read_fd)
        }
    }

    /// Read from a file descriptor and emit events to the frontend
    fn read_and_emit(read_fd: libc::c_int, stream_name: &'static str, app_handle: AppHandle) {
        // Convert the raw fd to a File for safe reading
        let file = unsafe { std::fs::File::from_raw_fd(read_fd) };
        let reader = BufReader::new(file);

        for line in reader.lines() {
            match line {
                Ok(text) => {
                    if !text.is_empty() {
                        let payload = OutputPayload {
                            stream: stream_name.to_string(),
                            text,
                        };
                        let _ = app_handle.emit("vivid-output", payload);
                    }
                }
                Err(e) => {
                    log::error!("[Output Capture] Error reading {}: {}", stream_name, e);
                    break;
                }
            }
        }
    }
}

#[cfg(unix)]
pub use unix_capture::start_capture;

#[cfg(not(unix))]
pub fn start_capture(_app_handle: tauri::AppHandle) {
    log::warn!("[Output Capture] Not implemented for this platform");
}
