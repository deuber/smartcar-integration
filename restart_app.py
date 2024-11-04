import os
import signal
import subprocess
import time

# Define the command to start your Node.js application
node_command = 'node index.js'

def find_process_pid(command):
    """
    Find the PID of a process running a specific command.
    """
    try:
        # Use pgrep to find the process ID
        pid = subprocess.check_output(['pgrep', '-f', command]).decode().strip()
        return int(pid)
    except subprocess.CalledProcessError:
        # No process found
        return None

def kill_process(pid):
    """
    Kill a process by its PID.
    """
    try:
        os.kill(pid, signal.SIGTERM)
        print(f"Process with PID {pid} terminated.")
    except OSError as e:
        print(f"Error terminating process with PID {pid}: {e}")

def start_process(command):
    """
    Start a new process with the given command.
    """
    process = subprocess.Popen(command, shell=True)
    print(f"Started new process with PID {process.pid}.")

def manage_node_app():
    """
    Manage the Node.js application: terminate if running, then start.
    """
    pid = find_process_pid(node_command)
    if pid:
        print(f"Node.js application is running with PID {pid}. Terminating...")
        kill_process(pid)
        # Wait a moment to ensure the process has terminated
        time.sleep(2)
    else:
        print("Node.js application is not currently running.")
    
    print("Starting Node.js application...")
    start_process(node_command)

if __name__ == "__main__":
    manage_node_app()
