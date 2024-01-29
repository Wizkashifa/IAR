def get_user_choice(options):
    print("Please choose an option by entering the number:")
    for i, option in enumerate(options, start=1):
        print(f"{i}. {option}")
    choice = input("Enter your choice (1-5): ")
    try:
        selected_option = options[int(choice)-1]
    except (IndexError, ValueError):
        print("Invalid choice. Please enter a number from 1 to 5.")
        return get_user_choice(options)
    return selected_option

def get_donation_amount():
    amount = input("Enter the amount you would like to charge: $")
    return amount

def get_event_name():
    event_name = input("Enter the name of the event: ")
    return event_name.replace(' ', '%20')

def generate_donation_link(choice, amount, event_name):
    base_url = f"https://donate.raleighmasjid.org/{choice}"
    return f"{base_url}?amount={amount}&cf16={event_name}"

def main():
    options = ["youth", "event", "women", "senior", "sports"]
    choice = get_user_choice(options)
    amount = get_donation_amount()
    event_name = get_event_name()
    donation_link = generate_donation_link(choice, amount, event_name)
    
    print("\nYour selected option:", choice)
    print("Your donation link is:", donation_link)

if __name__ == "__main__":
    main()
