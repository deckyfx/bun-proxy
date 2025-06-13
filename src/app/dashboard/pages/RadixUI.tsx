import { cn } from "@app/utils/cn";
import {
  Button,
  Flex,
  Text,
  Heading,
  TextField,
  TextArea,
  Select,
  Switch,
  HoverCard,
} from "@radix-ui/themes";
import {
  RippleButton,
  FloatingLabelInput,
  FloatingLabelNumber,
  FloatingLabelTextArea,
  CollapsibleCard,
  Tabs as RadixTabs,
} from "@app/components/index";

export default function RadixUI() {
  return (
    <div className={cn("p-6")}>
      <Heading size="8" mb="4">
        RadixUI Test Page
      </Heading>

      <Flex direction="column" gap="4">
        <CollapsibleCard
          title="Collapsible Card Example"
          defaultCollapsed={false}
        >
          <Flex p="4" direction="column" gap="3">
            <Text size="2">
              Click the title to collapse/expand this card. The title floats on
              the border just like our input labels.
            </Text>
            <RippleButton><span>Button inside card</span></RippleButton>
          </Flex>
        </CollapsibleCard>

        <CollapsibleCard title="Button Examples">
          <Flex p="4" direction="column" gap="3">
            <Flex gap="3">
              <RippleButton><span>Ripple Button</span></RippleButton>
              <RippleButton variant="soft"><span>Soft Ripple</span></RippleButton>
              <RippleButton variant="outline"><span>Outline Ripple</span></RippleButton>
              <RippleButton color="red"><span>Red Ripple</span></RippleButton>
            </Flex>

            <Text size="2" color="gray">
              Loading state buttons:
            </Text>
            <Flex gap="3">
              <RippleButton loading><span>Loading...</span></RippleButton>
              <RippleButton loading variant="soft">
                <span>Processing</span>
              </RippleButton>
              <RippleButton loading variant="outline" color="green">
                <span>Saving</span>
              </RippleButton>
            </Flex>

            <Text size="2" color="gray">
              Regular buttons (no ripple):
            </Text>
            <Flex gap="3">
              <Button>Default Button</Button>
              <Button variant="soft">Soft Button</Button>
              <Button variant="outline">Outline Button</Button>
              <Button color="red">Red Button</Button>
            </Flex>

            <Text size="2" color="gray">
              Buttons with icons:
            </Text>
            <Flex gap="3">
              <RippleButton>
                <span className="material-icons">add</span>
                <span>Add Item</span>
              </RippleButton>
              <RippleButton variant="soft" color="blue">
                <span className="material-icons">edit</span>
                <span>Edit</span>
              </RippleButton>
              <RippleButton variant="outline" color="red">
                <span className="material-icons">delete</span>
                <span>Delete</span>
              </RippleButton>
              <RippleButton color="green">
                <span className="material-icons">save</span>
                <span>Save</span>
              </RippleButton>
            </Flex>

            <Text size="2" color="gray">
              Icon-only buttons:
            </Text>
            <Flex gap="3">
              <RippleButton>
                <span className="material-icons">settings</span>
              </RippleButton>
              <RippleButton variant="soft" color="blue">
                <span className="material-icons">search</span>
              </RippleButton>
              <RippleButton variant="outline">
                <span className="material-icons">more_vert</span>
              </RippleButton>
              <RippleButton color="red">
                <span className="material-icons">close</span>
              </RippleButton>
            </Flex>
          </Flex>
        </CollapsibleCard>

        <CollapsibleCard title="Text Examples">
          <Flex p="4" direction="column" gap="3">
            <Text size="2">Small text</Text>
            <Text size="3">Medium text</Text>
            <Text size="4" weight="bold">
              Bold text
            </Text>
            <Text color="blue">Blue colored text</Text>
          </Flex>
        </CollapsibleCard>

        <CollapsibleCard title="Tabs Examples">
          <Flex p="4" direction="column" gap="3">
            <Text size="2" color="gray">
              This is a Radix UI based tabs component that matches the interface
              used in DNSDriver.tsx. It supports icons, content rendering, and
              maintains the same visual appearance.
            </Text>

            <RadixTabs
              tabs={[
                {
                  id: "overview",
                  label: "Overview",
                  icon: "dashboard",
                  content: (
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <Heading size="3" mb="2">
                        Overview Tab
                      </Heading>
                      <Text size="2">
                        This is the overview content with some sample text and
                        components.
                      </Text>
                      <Flex gap="2" mt="3">
                        <RippleButton size="1"><span>Action 1</span></RippleButton>
                        <RippleButton variant="soft" size="1">
                          <span>Action 2</span>
                        </RippleButton>
                      </Flex>
                    </div>
                  ),
                },
                {
                  id: "settings",
                  label: "Settings",
                  icon: "settings",
                  content: (
                    <div className="p-4 bg-blue-50 rounded-lg">
                      <Heading size="3" mb="2">
                        Settings Tab
                      </Heading>
                      <Text size="2">
                        Configuration and preferences would go here.
                      </Text>
                      <Flex direction="column" gap="3" mt="3">
                        <FloatingLabelInput
                          label="Configuration Name"
                          id="config-name"
                        />
                        <Switch /> <Text size="2">Enable feature</Text>
                      </Flex>
                    </div>
                  ),
                },
                {
                  id: "analytics",
                  label: "Analytics",
                  icon: "analytics",
                  content: (
                    <div className="p-4 bg-green-50 rounded-lg">
                      <Heading size="3" mb="2">
                        Analytics Tab
                      </Heading>
                      <Text size="2">
                        Charts and metrics would be displayed here.
                      </Text>
                      <Text size="1" color="gray" mt="2">
                        Sample data: Users: 1,234 | Sessions: 5,678 |
                        Conversions: 12.3%
                      </Text>
                    </div>
                  ),
                },
                {
                  id: "help",
                  label: "Help & Support",
                  icon: "help",
                  content: (
                    <div className="p-4 bg-purple-50 rounded-lg">
                      <Heading size="3" mb="2">
                        Help & Support
                      </Heading>
                      <Text size="2">
                        Documentation, FAQs, and contact information.
                      </Text>
                      <Flex direction="column" gap="2" mt="3">
                        <Text size="1">• How to get started</Text>
                        <Text size="1">• Troubleshooting guide</Text>
                        <Text size="1">• Contact support</Text>
                      </Flex>
                    </div>
                  ),
                },
              ]}
              defaultTab="overview"
            />
          </Flex>
        </CollapsibleCard>

        <CollapsibleCard title="Input Examples">
          <Flex p="4" direction="column" gap="3">
            <Heading size="4">Input Examples</Heading>

            <Text size="2" color="gray">
              Floating label inputs:
            </Text>
            <FloatingLabelInput label="Full Name" id="name" />
            <FloatingLabelInput
              label="Email Address"
              id="email"
              variant="soft"
            />
            <FloatingLabelInput
              label="Phone Number"
              id="phone"
              variant="surface"
            />

            <Text size="2" color="gray">
              Inputs with icons:
            </Text>
            <FloatingLabelInput
              label="Search"
              id="search"
              icon={<span>🔍</span>}
              iconPosition="left"
            />
            <FloatingLabelInput
              label="Username"
              id="username"
              icon={<span>👤</span>}
              iconPosition="left"
              variant="soft"
            />
            <FloatingLabelInput
              label="Password"
              id="password"
              type="password"
              icon={<span>🔒</span>}
              iconPosition="right"
            />

            <Text size="2" color="gray">
              Floating label number inputs:
            </Text>
            <FloatingLabelNumber label="Age" id="age" min={0} max={120} />
            <FloatingLabelNumber
              label="Price"
              id="price"
              step={0.01}
              variant="soft"
            />
            <FloatingLabelNumber
              label="Quantity"
              id="quantity"
              min={1}
              variant="surface"
            />

            <Text size="2" color="gray">
              Number inputs with icons:
            </Text>
            <FloatingLabelNumber
              label="Price"
              id="price-icon"
              step={0.01}
              icon={<span>💰</span>}
              iconPosition="left"
            />
            <FloatingLabelNumber
              label="Weight"
              id="weight"
              icon={<span>⚖️</span>}
              iconPosition="right"
              variant="soft"
            />

            <Text size="2" color="gray">
              Floating label text areas:
            </Text>
            <FloatingLabelTextArea
              label="Description"
              id="description"
              rows={3}
            />
            <FloatingLabelTextArea
              label="Comments"
              id="comments"
              rows={4}
              variant="soft"
            />

            <Text size="2" color="gray">
              Status feedback examples:
            </Text>
            <FloatingLabelInput
              label="Valid Email"
              id="valid-email"
              status="success"
              message="Email format is correct"
            />
            <FloatingLabelInput
              label="Invalid Email"
              id="invalid-email"
              status="error"
              message="Please enter a valid email address"
            />
            <FloatingLabelNumber
              label="Warning Age"
              id="warning-age"
              status="warning"
              message="Age seems unusually high"
            />
            <FloatingLabelTextArea
              label="Error Message"
              id="error-message"
              status="error"
              message="This field is required"
              rows={2}
            />

            <Text size="2" color="gray">
              Regular inputs:
            </Text>
            <TextField.Root placeholder="Enter your name..." />
            <TextField.Root variant="soft" placeholder="Soft variant input" />
            <TextField.Root
              variant="surface"
              placeholder="Surface variant input"
            />
            <TextArea placeholder="Type your message here..." rows={3} />
          </Flex>
        </CollapsibleCard>

        <CollapsibleCard title="Select Components">
          <Flex p="4" direction="column" gap="3">
            <Text size="2" color="gray">
              Basic select dropdowns:
            </Text>
            <Select.Root>
              <Select.Trigger placeholder="Choose a country..." />
              <Select.Content>
                <Select.Item value="us">United States</Select.Item>
                <Select.Item value="uk">United Kingdom</Select.Item>
                <Select.Item value="ca">Canada</Select.Item>
                <Select.Item value="au">Australia</Select.Item>
              </Select.Content>
            </Select.Root>

            <Select.Root>
              <Select.Trigger variant="soft" placeholder="Select a role..." />
              <Select.Content>
                <Select.Item value="admin">Administrator</Select.Item>
                <Select.Item value="user">User</Select.Item>
                <Select.Item value="guest">Guest</Select.Item>
              </Select.Content>
            </Select.Root>

            <Text size="2" color="gray">
              Select with label on top:
            </Text>
            <Flex direction="column" gap="2">
              <Text size="2" weight="medium">Department</Text>
              <Select.Root>
                <Select.Trigger placeholder="Choose department..." />
                <Select.Content>
                  <Select.Item value="engineering">Engineering</Select.Item>
                  <Select.Item value="design">Design</Select.Item>
                  <Select.Item value="marketing">Marketing</Select.Item>
                  <Select.Item value="sales">Sales</Select.Item>
                </Select.Content>
              </Select.Root>
            </Flex>

            <Flex direction="column" gap="2">
              <Text size="2" weight="medium">Priority Level</Text>
              <Select.Root>
                <Select.Trigger variant="soft" placeholder="Select priority..." />
                <Select.Content>
                  <Select.Item value="low">Low Priority</Select.Item>
                  <Select.Item value="medium">Medium Priority</Select.Item>
                  <Select.Item value="high">High Priority</Select.Item>
                  <Select.Item value="urgent">Urgent</Select.Item>
                </Select.Content>
              </Select.Root>
            </Flex>

            <Text size="2" color="gray">
              Select with label on left side:
            </Text>
            <Flex align="center" gap="3">
              <Text size="2" weight="medium" style={{ minWidth: "100px" }}>
                Status:
              </Text>
              <Select.Root>
                <Select.Trigger placeholder="Select status..." />
                <Select.Content>
                  <Select.Item value="active">Active</Select.Item>
                  <Select.Item value="inactive">Inactive</Select.Item>
                  <Select.Item value="pending">Pending</Select.Item>
                  <Select.Item value="suspended">Suspended</Select.Item>
                </Select.Content>
              </Select.Root>
            </Flex>

            <Flex align="center" gap="3">
              <Text size="2" weight="medium" style={{ minWidth: "100px" }}>
                Theme:
              </Text>
              <Select.Root>
                <Select.Trigger variant="soft" placeholder="Choose theme..." />
                <Select.Content>
                  <Select.Item value="light">Light Mode</Select.Item>
                  <Select.Item value="dark">Dark Mode</Select.Item>
                  <Select.Item value="auto">Auto (System)</Select.Item>
                </Select.Content>
              </Select.Root>
            </Flex>

            <Text size="2" color="gray">
              Select with icons in options:
            </Text>
            <Select.Root>
              <Select.Trigger placeholder="Select with icons..." />
              <Select.Content>
                <Select.Item value="settings">
                  <Flex align="center" gap="2">
                    <span className="material-icons text-sm">settings</span>
                    Settings
                  </Flex>
                </Select.Item>
                <Select.Item value="profile">
                  <Flex align="center" gap="2">
                    <span className="material-icons text-sm">person</span>
                    Profile
                  </Flex>
                </Select.Item>
                <Select.Item value="logout">
                  <Flex align="center" gap="2">
                    <span className="material-icons text-sm">logout</span>
                    Logout
                  </Flex>
                </Select.Item>
              </Select.Content>
            </Select.Root>
          </Flex>
        </CollapsibleCard>

        <CollapsibleCard title="Other Components">
          <Flex p="4" direction="column" gap="3">
            <Text size="2" color="gray">
              Switch components:
            </Text>
            <Flex direction="column" gap="3">
              <Flex align="center" gap="2">
                <Switch defaultChecked />
                <Text size="2">Enable notifications</Text>
              </Flex>
              <Flex align="center" gap="2">
                <Switch size="1" />
                <Text size="2">Small switch</Text>
              </Flex>
              <Flex align="center" gap="2">
                <Switch size="3" color="green" />
                <Text size="2">Large green switch</Text>
              </Flex>
            </Flex>

            <Text size="2" color="gray">
              Hover cards (future tooltip replacement):
            </Text>
            <Flex gap="3">
              <HoverCard.Root>
                <HoverCard.Trigger>
                  <Button variant="soft">Hover me</Button>
                </HoverCard.Trigger>
                <HoverCard.Content>
                  <Text size="2">
                    This is a hover card with useful information!
                  </Text>
                </HoverCard.Content>
              </HoverCard.Root>

              <HoverCard.Root>
                <HoverCard.Trigger>
                  <Text
                    size="2"
                    style={{ textDecoration: "underline", cursor: "pointer" }}
                  >
                    User Profile
                  </Text>
                </HoverCard.Trigger>
                <HoverCard.Content>
                  <Flex direction="column" gap="2">
                    <Heading size="3">John Doe</Heading>
                    <Text size="2" color="gray">
                      Software Engineer
                    </Text>
                    <Text size="1">Joined 2 years ago</Text>
                  </Flex>
                </HoverCard.Content>
              </HoverCard.Root>
            </Flex>
          </Flex>
        </CollapsibleCard>
      </Flex>
    </div>
  );
}
